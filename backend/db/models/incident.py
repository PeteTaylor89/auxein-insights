from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from db.base_class import Base

# Injury types (from schemas.incident.NZ_INJURY_TYPES) that are, on their own,
# a notifiable injury under the HSW (Notifiable Events) Regulations 2016.
# NOTE: fractures are handled separately because minor finger/toe/nose
# fractures are NOT notifiable per the WorkSafe guide.
_NOTIFIABLE_INJURY_TYPES = frozenset({
    "amputation", "eye_injury", "spinal_injury",
    "head_injury", "concussion", "loss_of_consciousness",
    "degloving", "scalping", "infection",
})

# Lifting/transport plant whose collapse, overturning or failure is a
# notifiable incident. Matched against the free-text description.
_LIFTING_PLANT_TERMS = (
    "crane", "forklift", "hoist", "elevator", "platform",
    "boom lift", "scissor lift", "cherry picker", "telehandler",
)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=True, index=True)

    # Incident identification
    incident_number = Column(String(50), unique=False, nullable=False)  # Auto-generated
    incident_title = Column(String(200), nullable=False)
    incident_description = Column(Text, nullable=False)
    
    # Incident classification
    incident_type = Column(String(50), nullable=False)  # injury, near_miss, property_damage, environmental, security
    severity = Column(String(30), nullable=False)  # minor, moderate, serious, critical, fatal
    category = Column(String(50), nullable=False)  # slip_trip_fall, chemical_exposure, equipment, etc.
    
    # NZ H&S specific fields
    is_notifiable = Column(Boolean, default=False, nullable=False)  # WorkSafe NZ notification required
    notifiable_type = Column(String(50), nullable=True)  # death, serious_injury, dangerous_occurrence
    worksafe_notified = Column(Boolean, default=False, nullable=False)
    worksafe_notification_date = Column(DateTime(timezone=True), nullable=True)
    worksafe_reference = Column(String(100), nullable=True)
    
    # Incident details
    incident_date = Column(DateTime(timezone=True), nullable=False)
    discovered_date = Column(DateTime(timezone=True), nullable=True)  # When discovered (if different)
    location_description = Column(String(500), nullable=False)
    location = Column(Geometry(geometry_type='POINT', srid=4326), nullable=True)  # GPS coordinates
    
    # People involved — reporter is one of: a company user OR a contractor.
    # The DB constraint `ck_incidents_reporter_set` ensures at least one is set.
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reported_by_contractor_id = Column(Integer, ForeignKey("contractors.id", ondelete="SET NULL"), nullable=True, index=True)
    injured_person_name = Column(String(200), nullable=True)  # May not be a system user
    injured_person_role = Column(String(100), nullable=True)
    injured_person_company = Column(String(200), nullable=True)  # For contractors
    witness_details = Column(Text, nullable=True)
    
    # Injury/damage details
    injury_type = Column(String(100), nullable=True)  # cut, bruise, fracture, etc.
    body_part_affected = Column(String(100), nullable=True)
    medical_treatment_required = Column(Boolean, default=False, nullable=False)
    medical_provider = Column(String(200), nullable=True)
    time_off_work = Column(Boolean, default=False, nullable=False)
    estimated_time_off_days = Column(Integer, nullable=True)
    
    property_damage_cost = Column(Numeric(10, 2), nullable=True)
    environmental_impact = Column(Text, nullable=True)
    
    # Investigation
    investigation_required = Column(Boolean, default=True, nullable=False)
    investigation_status = Column(String(30), default="pending", nullable=False)  # pending, in_progress, completed
    investigator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    investigation_due_date = Column(DateTime(timezone=True), nullable=True)
    investigation_completed_date = Column(DateTime(timezone=True), nullable=True)
    investigation_findings = Column(Text, nullable=True)
    
    # Root cause analysis
    immediate_causes = Column(JSON, default=list, nullable=False)  # List of immediate causes
    root_causes = Column(JSON, default=list, nullable=False)  # List of root causes
    contributing_factors = Column(JSON, default=list, nullable=False)
    
    # Risk linkage
    related_risk_id = Column(Integer, ForeignKey("site_risks.id"), nullable=True)  # Link to existing risk
    new_risk_created = Column(Boolean, default=False, nullable=False)  # If new risk was created
    
    # Corrective actions
    immediate_actions_taken = Column(Text, nullable=True)
    corrective_actions_required = Column(Text, nullable=True)
    
    # Status and workflow
    status = Column(String(30), default="open", nullable=False)  # open, investigating, awaiting_actions, closed
    closed_date = Column(DateTime(timezone=True), nullable=True)
    closed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    closure_reason = Column(Text, nullable=True)
    
    # Follow-up and lessons learned
    lessons_learned = Column(Text, nullable=True)
    communication_required = Column(Boolean, default=False, nullable=False)
    communication_completed = Column(Boolean, default=False, nullable=False)
    
    # File attachments and evidence
    evidence_collected = Column(Boolean, default=False, nullable=False)
    photos_taken = Column(Boolean, default=False, nullable=False)
    
    # Review and approval
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_date = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_date = Column(DateTime(timezone=True), nullable=True)
    
    # Additional metadata
    custom_fields = Column(JSON, default=dict, nullable=False)
    tags = Column(JSON, default=list, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    # Relationships
    company = relationship("Company", back_populates="incidents")
    assigned_property = relationship("Property", foreign_keys=[property_id])
    reporter = relationship("User", foreign_keys=[reported_by], back_populates="reported_incidents")
    investigator = relationship("User", foreign_keys=[investigator_id], back_populates="investigated_incidents")
    closer = relationship("User", foreign_keys=[closed_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    approver = relationship("User", foreign_keys=[approved_by])
    related_risk = relationship("SiteRisk", back_populates="incidents")
    # corrective_actions = relationship("RiskAction", back_populates="incident")
    
    def __repr__(self):
        return f"<Incident(id={self.id}, number='{self.incident_number}', type='{self.incident_type}')>"
    
    @property
    def is_overdue_investigation(self):
        """Check if investigation is overdue"""
        if (self.investigation_required and 
            self.investigation_status != "completed" and 
            self.investigation_due_date):
            from datetime import datetime, timezone
            return datetime.now(timezone.utc) > self.investigation_due_date
        return False
    
    @property
    def requires_worksafe_notification(self):
        """Check if this incident requires WorkSafe NZ notification"""
        return self.is_notifiable and not self.worksafe_notified

    @property
    def notification_urgency(self):
        """
        How urgently WorkSafe must be notified.

        HSWA requires notification 'as soon as possible … by the fastest way
        possible'. There is no fixed statutory hour-clock for serious injuries
        or dangerous occurrences. A death must be reported immediately by phone.
        """
        if not self.is_notifiable:
            return None
        if self.notifiable_type == "death":
            return "IMMEDIATE"
        return "AS_SOON_AS_POSSIBLE"
    
    @property
    def is_serious_incident(self):
        """Check if this is a serious incident (for prioritization)"""
        return (self.severity in ["serious", "critical", "fatal"] or 
                self.is_notifiable or 
                self.medical_treatment_required)
    
    @property
    def days_since_incident(self):
        """Calculate days since the incident occurred"""
        from datetime import datetime, timezone
        delta = datetime.now(timezone.utc) - self.incident_date
        return delta.days
    
    @property
    def investigation_days_remaining(self):
        """Calculate days remaining for investigation"""
        if not self.investigation_due_date:
            return None
        from datetime import datetime, timezone
        delta = self.investigation_due_date - datetime.now(timezone.utc)
        return delta.days
    
    def generate_incident_number(self):
        """Generate unique incident number"""
        from datetime import datetime
        year = datetime.now().year
        current_user: User = Depends(get_current_user)
        # This would typically query the database for the next sequence number
        # For now, using a simple format: INC-YYYY-NNNN
        return f"INC-{current_year}-{current_user.company_id}-{self.id:04d}"
    
    def determine_notifiability(self):
        """
        Classify this incident against the Health and Safety at Work Act 2015
        and the HSW (Notifiable Events) Regulations 2016, following WorkSafe's
        guide 'What events need to be notified?' (WSNZ_4705, Mar 2024).

        A notifiable event is a death, a notifiable injury/illness, or a
        notifiable incident. This sets `is_notifiable` and `notifiable_type`
        together so they can never disagree.

        Detection prefers structured fields (severity, injury_type,
        body_part_affected, incident_type, category) and falls back to
        free-text description keywords only for triggers that have no
        structured equivalent.
        """
        self.is_notifiable = False
        self.notifiable_type = None

        desc = (self.incident_description or "").lower()
        injury = self.injury_type or ""
        body = self.body_part_affected or ""
        severity = self.severity or ""
        treated = bool(self.medical_treatment_required)

        # ---- DEATH (s.16 HSWA) ----
        if severity == "fatal":
            self.is_notifiable = True
            self.notifiable_type = "death"
            return

        # ---- NOTIFIABLE INJURY OR ILLNESS (reg 7 / Table 1) ----
        # A fracture is notifiable EXCEPT minor fractures to fingers, toes
        # or the nose (the guide calls out a straightened broken nose).
        fracture_notifiable = (
            injury == "fracture"
            and body not in ("finger", "toe", "nose")
        )

        # Serious burn: needs intensive/critical care (skin graft, compression
        # garment). A burn treatable by washing + dressing is not notifiable.
        serious_burn = (
            injury in ("burn", "chemical_burn")
            and (
                severity in ("serious", "critical")
                or treated
                or any(t in desc for t in (
                    "skin graft", "compression garment",
                    "intensive care", "critical care",
                ))
            )
        )

        # Loss of a bodily function (consciousness, speech, limb movement,
        # organ function, senses) requiring immediate treatment.
        loss_of_function = any(t in desc for t in (
            "unconscious", "loss of consciousness", "lost consciousness",
            "fractured skull", "skull fracture", "bleeding in the brain",
            "brain bleed", "memory loss", "loss of speech", "paralysis",
            "paralysed", "loss of sight", "loss of hearing", "organ function",
        ))

        # Serious laceration requiring immediate medical treatment (deep cut
        # with muscle/tendon/nerve/vessel damage). Superficial cuts excluded.
        serious_laceration = (
            injury in ("laceration", "cut")
            and treated
            and (
                severity in ("serious", "critical")
                or any(t in desc for t in (
                    "deep cut", "muscle", "tendon", "nerve",
                    "blood vessel", "stitches", "stitching",
                ))
            )
        )

        # Admitted to hospital as an inpatient for immediate treatment.
        # Out-patient / ED-only treatment is explicitly NOT notifiable, so we
        # require an inpatient-admission signal rather than just "hospital".
        hospital_admission = any(t in desc for t in (
            "admitted to hospital", "hospital admission",
            "inpatient", "in-patient", "admitted as an inpatient",
        ))

        # Injury/illness requiring medical treatment within 48h of exposure
        # to a substance (chemical/respiratory exposure).
        substance_exposure = (
            (self.incident_type == "environmental"
             or self.category in ("chemical_exposure", "respiratory"))
            and treated
        )

        # Serious infection / occupational zoonosis (leptospirosis,
        # Legionnaire's, E. coli) — relevant to soil/animal/agricultural work.
        serious_infection = (
            injury in ("infection", "zoonosis")
            or any(t in desc for t in (
                "leptospirosis", "legionnaire", "zoonosis", "zoonotic",
                "e. coli", "e.coli",
            ))
        )

        notifiable_injury = any([
            fracture_notifiable,
            injury == "amputation",
            # Serious head injury / loss of consciousness
            injury in ("head_injury", "concussion", "loss_of_consciousness")
            or body == "head",
            loss_of_function,
            # Serious eye injury
            injury == "eye_injury" or body == "eye",
            serious_burn,
            # Degloving / scalping
            injury in ("degloving", "scalping")
            or any(t in desc for t in ("degloving", "degloved", "scalp")),
            # Spinal injury (excludes back strain/bruise — handled by injury_type)
            injury == "spinal_injury"
            or any(t in desc for t in (
                "spinal cord", "spine fracture", "cervical vertebra",
                "thoracic vertebra", "lumbar vertebra", "sacral vertebra",
            )),
            serious_laceration,
            hospital_admission,
            substance_exposure,
            serious_infection,
        ])

        if notifiable_injury:
            self.is_notifiable = True
            self.notifiable_type = "serious_injury"
            return

        # ---- NOTIFIABLE INCIDENT (reg 8) ----
        # An explicit dangerous-occurrence classification always qualifies.
        explicit_dangerous = self.incident_type == "dangerous_occurrence"

        # Electric shock from anything that could deliver a lethal shock.
        # Static / extra-low-voltage shocks are excluded.
        electric_shock = (
            self.category == "electrical"
            and (treated or any(t in desc for t in (
                "shock", "electrocuted", "electrocution",
            )))
            and "static" not in desc
        )

        # Collapse / overturning / failure of lifting or transport plant.
        plant_failure = (
            self.category == "equipment_failure"
            and any(t in desc for t in _LIFTING_PLANT_TERMS)
        ) or any(t in desc for t in (
            "overturned", "overturning", "plant collapse",
        ))

        notifiable_incident = any([
            explicit_dangerous,
            # Uncontrolled escape/spill/leak of a substance
            (self.incident_type == "environmental"
             and any(t in desc for t in (
                 "spill", "leak", "escape", "release",
                 "chemical", "toxic", "hazardous",
             ))),
            # Implosion, explosion or fire
            self.category == "fire_explosion"
            or any(t in desc for t in ("explosion", "fire", "blast", "implosion")),
            # Gas or steam escaping / pressurised substance escaping
            any(t in desc for t in (
                "gas escape", "gas leak", "steam", "pressurised",
                "pressurized", "compressed air", "pressure release",
            )),
            electric_shock,
            # Fall or release from height of any plant, substance or thing
            any(t in desc for t in (
                "fell from height", "fall from height", "released from height",
                "object fell", "dropped from height", "falling object",
            )),
            plant_failure,
            # Collapse or partial collapse of a structure
            self.category == "structural_collapse"
            or any(t in desc for t in (
                "structural failure", "building collapse", "roof collapse",
                "structure collapse",
            )),
            # Collapse/failure of an excavation or its shoring
            any(t in desc for t in (
                "excavation", "trench collapse", "shoring", "cave-in", "cave in",
            )),
            # Inrush of water, mud or gas in an underground working
            any(t in desc for t in (
                "inrush", "water inrush", "mud inrush", "gas inrush",
            )),
            # Interruption of main ventilation in an underground excavation/tunnel
            any(t in desc for t in (
                "ventilation failure", "ventilation interruption",
                "loss of ventilation",
            )),
            # Vessel collision, capsize, or inrush of water into a vessel
            any(t in desc for t in (
                "vessel capsize", "vessel collision", "capsized",
                "water into the vessel", "inrush of water into",
            )),
        ])

        if notifiable_incident:
            self.is_notifiable = True
            self.notifiable_type = "dangerous_occurrence"
            return

        # ---- NEAR MISS WITH SERIOUS POTENTIAL (dangerous occurrence) ----
        if self.incident_type == "near_miss" and severity in ("serious", "critical"):
            if (self.category in ("fire_explosion", "structural_collapse", "electrical")
                or any(t in desc for t in (
                    "could have died", "potential fatality", "narrowly avoided",
                    "close call", "serious injury potential",
                ))):
                self.is_notifiable = True
                self.notifiable_type = "dangerous_occurrence"
                return

    def set_investigation_due_date(self):
        """
        Set an internal investigation due date based on severity and
        notifiability. These are Auxein workflow targets for prompting an
        internal investigation — they are NOT the WorkSafe notification
        deadline (which is 'as soon as possible'; see notification_urgency).
        """
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc)
        if self.severity == "fatal":
            self.investigation_due_date = now + timedelta(hours=24)
        elif self.severity in ("serious", "critical") or self.is_notifiable:
            self.investigation_due_date = now + timedelta(hours=48)
        elif self.severity == "moderate":
            self.investigation_due_date = now + timedelta(days=7)
        else:
            self.investigation_due_date = now + timedelta(days=14)
    
    def mark_worksafe_notified(self, reference_number: str = None):
        """Mark as notified to WorkSafe NZ"""
        from datetime import datetime, timezone
        self.worksafe_notified = True
        self.worksafe_notification_date = datetime.now(timezone.utc)
        if reference_number:
            self.worksafe_reference = reference_number
    
    def close_incident(self, closed_by_id: int, closure_reason: str):
        """Close the incident"""
        from datetime import datetime, timezone
        self.status = "closed"
        self.closed_date = datetime.now(timezone.utc)
        self.closed_by = closed_by_id
        self.closure_reason = closure_reason