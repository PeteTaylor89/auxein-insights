"""Enterprise accounts — a client organisation that owns many sites.

Tables created by `alembic/versions/insights_accounts.py`; the reasoning for the
shape lives there. Two things are restated because they read as omissions:

* This is NOT `companies`. That table is Grow's tenancy, and an Insights-only
  client has no reason to have a row in it. `InsightsAccount.company_id` links
  the two where a client happens to be both, and is NULL otherwise.

* Membership is its own table rather than a column on `public_users`. A person
  can be a Pro subscriber in their own right AND a named user on a client
  account, and those are different entitlements — the account gives them the
  client's 67 sites, their subscription gives them their own point.
"""

from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, DateTime, ForeignKey, func
)

from db.base_class import Base


class InsightsAccount(Base):
    """A client organisation. Owns sites; has named members."""
    __tablename__ = 'insights_account'

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    # Addressable in a URL. A client dashboard is a link somebody pastes to a
    # colleague, and /pro/accounts/17 is not that link.
    slug = Column(String(120), nullable=False, unique=True)
    # 'active' | 'suspended'. Suspension is NOT deletion: an account that stops
    # paying keeps its sites and its extracted history and gets them back on
    # renewal, rather than being re-provisioned from a spreadsheet.
    status = Column(Text, nullable=False, server_default='active')
    company_id = Column(Integer,
                        ForeignKey('companies.id', ondelete='SET NULL'),
                        nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(),
                        nullable=True)

    @property
    def is_active(self) -> bool:
        return self.status == 'active'

    def __repr__(self) -> str:
        return f"<InsightsAccount {self.id} {self.slug} {self.status}>"


class InsightsAccountMember(Base):
    """A named user on an account.

    `role` is deliberately two values and not a permission matrix. This is a
    reporting product; the only question anyone has is who may add a colleague.
    """
    __tablename__ = 'insights_account_member'

    account_id = Column(BigInteger,
                        ForeignKey('insights_account.id', ondelete='CASCADE'),
                        primary_key=True)
    public_user_id = Column(Integer,
                            ForeignKey('public_users.id', ondelete='CASCADE'),
                            primary_key=True, index=True)
    # 'owner' can manage membership; 'member' can read.
    role = Column(Text, nullable=False, server_default='member')
    created_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)

    def __repr__(self) -> str:
        return (f"<InsightsAccountMember account={self.account_id} "
                f"user={self.public_user_id} {self.role}>")
