# db/models/public_user.py - Public User Model with Marketing & User Segmentation
from sqlalchemy import Column, Integer, SmallInteger, String, DateTime, Boolean, Text, ARRAY, ForeignKey
from sqlalchemy.sql import func
from db.base_class import Base
from datetime import datetime, timezone

class PublicUser(Base):
    __tablename__ = "public_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    # Nullable: Grow projection rows (origin='grow') carry no password and can
    # never password-login — see ensure_insights_profile + the /login guard.
    hashed_password = Column(String, nullable=True)
    first_name = Column(String(50), nullable=True)
    last_name = Column(String(50), nullable=True)

    user_type = Column(String(50), nullable=True)
    company_name = Column(String(200), nullable=True)
    job_title = Column(String(100), nullable=True)
    region_of_interest = Column(String(100), nullable=True)

    newsletter_opt_in = Column(Boolean, default=False, nullable=False)
    marketing_opt_in = Column(Boolean, default=False, nullable=False)
    research_opt_in = Column(Boolean, default=False, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)

    verification_token = Column(String(255), nullable=True)
    verification_sent_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    unsubscribe_token = Column(String(255), nullable=True, unique=True)

    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    last_login = Column(DateTime(timezone=True), nullable=True)
    login_count = Column(Integer, default=0, nullable=False)

    first_map_view = Column(DateTime(timezone=True), nullable=True)
    last_active = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Admin flag
    is_admin = Column(Boolean, default=False, nullable=False)

    # Pro subscription
    subscription_tier = Column(String(10), default='free', nullable=False)
    pro_started_at = Column(DateTime(timezone=True), nullable=True)
    pro_expires_at = Column(DateTime(timezone=True), nullable=True)
    # How many saved sites this subscriber may hold. A point subscription is
    # priced separately from Pro and STACKS, so Pro tier alone does not imply a
    # site and this is not derivable from `subscription_tier`. Grow users get
    # Pro entitlements but not a free point.
    pro_site_quota = Column(SmallInteger, nullable=False, default=0,
                            server_default='0')

    # Extended email preferences
    frequency_preference = Column(String(20), default='weekly', nullable=False)
    preferred_regions = Column(ARRAY(String), nullable=True)

    # Progressive profiling
    role_description = Column(String(50), nullable=True)
    key_concerns = Column(ARRAY(String), nullable=True)
    vineyard_size = Column(String(50), nullable=True)
    profiling_completed_at = Column(DateTime(timezone=True), nullable=True)

    # Grow -> Insights link (one-way SSO). A 'grow' origin row is a password-less
    # projection of a Grow users.id; 'signup' is a self-registered subscriber.
    grow_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True)
    origin = Column(String(20), nullable=False, default="signup", server_default="signup")

    def __repr__(self):
        return f"<PublicUser(id={self.id}, email='{self.email}', type='{self.user_type}', verified={self.is_verified})>"

    @property
    def is_pro(self) -> bool:
        """Entitled to Pro features.

        Exposed on the model so it can be serialised straight into
        PublicUserResponse. The frontend must read THIS rather than deriving
        entitlement from `subscription_tier`, because the response does not
        carry `pro_expires_at` — a client rule would call a lapsed subscription
        Pro, show the Pro UI, and then eat a 402.

        Imported lazily: core.entitlements imports this model.
        """
        from core.entitlements import is_pro as _is_pro
        return _is_pro(self)

    @property
    def portfolio_accounts(self) -> list:
        """Active enterprise accounts this user is a named member of.

        A LIST, not a boolean, because the nav needs to know whether to show
        Portfolio and the page needs to know which account to open, and two
        answers derived separately are two chances to disagree.

        Serialised onto `PublicUserResponse`, so the header can render the link
        without a second request. Empty for almost every subscriber, and that is
        the normal case — an account is an enterprise arrangement, not a tier.

        Queried through `object_session` rather than a relationship so that a
        detached user (a token decoded without a live session, a unit test)
        answers `[]` instead of raising. Entitlement checks call this, and a
        crash in an entitlement check is a locked-out paying customer.
        """
        from sqlalchemy import text
        from sqlalchemy.orm import object_session

        # Memoised per instance. `is_pro` reads this on every gated request and
        # the serialiser reads it again on the way out, and `user_to_list_item`
        # in admin_users.py calls `is_pro` once PER ROW of the admin user list.
        # Without the cache that page issues one query per user and this
        # property becomes an N+1 nobody went looking for.
        cached = self.__dict__.get("_portfolio_accounts_cache")
        if cached is not None:
            return cached

        db = object_session(self)
        if db is None or self.id is None:
            return []
        rows = db.execute(text("""
            SELECT a.slug, a.name, m.role
              FROM insights_account_member m
              JOIN insights_account a ON a.id = m.account_id
             WHERE m.public_user_id = :uid AND a.status = 'active'
             ORDER BY a.name
        """), {"uid": self.id}).mappings().all()
        result = [dict(r) for r in rows]
        # Straight into __dict__: this is not a mapped column, so SQLAlchemy
        # leaves it alone and it dies with the instance rather than outliving a
        # membership change the way a process-level cache would.
        self.__dict__["_portfolio_accounts_cache"] = result
        return result

    @property
    def own_site_count(self) -> int:
        """Pro-slot sites this user personally holds. Account sites are not theirs.

        Only the `public_user_id` owner counts. An account's sites belong to the
        account (`ck_insights_site_one_owner` allows exactly one owner), so a
        member of a 67-site client still personally holds zero.
        """
        from sqlalchemy import text
        from sqlalchemy.orm import object_session

        cached = self.__dict__.get("_own_site_count_cache")
        if cached is not None:
            return cached
        db = object_session(self)
        if db is None or self.id is None:
            return 0
        n = db.execute(text("""
            SELECT count(*) FROM insights_site WHERE public_user_id = :uid
        """), {"uid": self.id}).scalar() or 0
        self.__dict__["_own_site_count_cache"] = int(n)
        return int(n)

    @property
    def has_site_access(self) -> bool:
        """Whether 'My Site' means anything for this user. See core.entitlements."""
        from core.entitlements import has_site_access as _has
        return _has(self)


    @property
    def full_name(self):
        """Return the user's full name if available, otherwise email"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
        else:
            return self.email.split('@')[0]
    
    @property
    def can_login(self):
        """Check if user can login (must be active and verified)"""
        return self.is_active and self.is_verified
    
    @property
    def is_wine_professional(self):
        """Wine industry specifically. NOT "works in the primary sector".

        A grower, an agronomist or a council hydrologist is a professional user
        and is not a wine professional, and the difference matters wherever this
        gates wine-specific content. `is_industry_professional` is the wider
        test; reach for that one unless the thing being gated is about wine.
        """
        return self.user_type in ['wine_company_owner', 'wine_company_employee', 'consultant']

    @property
    def is_industry_professional(self):
        """Works in the primary sector in any capacity, wine included."""
        return self.user_type in [
            'wine_company_owner', 'wine_company_employee', 'consultant',
            'grower', 'agronomist', 'public_sector',
        ]
    
    @property
    def marketing_segment(self):
        """
        Return marketing segment for targeted communications.
        Useful for email campaigns and analytics.
        """
        if self.user_type == 'wine_company_owner':
            return 'high_value_prospect'  # Most likely to buy paid tool
        elif self.user_type == 'wine_company_employee':
            return 'decision_influencer'  # May influence purchase decision
        elif self.user_type == 'consultant':
            return 'referral_partner'  # May refer clients
        elif self.user_type == 'wine_enthusiast':
            return 'community_member'  # Engagement, not conversion
        elif self.user_type == 'researcher':
            return 'academic_partner'  # Potential collaboration
        elif self.user_type == 'grower':
            return 'high_value_prospect'  # Buys the same thing for another crop
        elif self.user_type == 'agronomist':
            return 'referral_partner'  # Advises growers, same as a consultant
        elif self.user_type == 'public_sector':
            return 'institutional'  # Councils supply the data and may licence it
        else:
            return 'general_user'
    
    def can_receive_newsletter(self):
        """Check if user has opted in to newsletters"""
        return self.newsletter_opt_in and self.is_verified
    
    def can_receive_marketing(self):
        """Check if user has opted in to marketing emails"""
        return self.marketing_opt_in and self.is_verified
    
    def update_last_active(self):
        """Update last active timestamp (call when user interacts)"""
        self.last_active = datetime.now(timezone.utc)