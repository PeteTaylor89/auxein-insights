# services/notification_service.py
from typing import Optional, List, Literal
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc

from db.models.notification import Notification, NotificationType
from db.models.user import User
from db.models.contractor import Contractor


class NotificationService:
    """Service for creating and managing notifications"""

    def __init__(self, db: Session):
        self.db = db

    # ============================================
    # Core notification creation
    # ============================================

    def notify(
        self,
        company_id: int,
        recipient_type: Literal["user", "contractor"],
        recipient_id: int,
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> Notification:
        """
        Create a notification for a single user or contractor.

        Args:
            company_id: Company the notification belongs to
            recipient_type: "user" or "contractor"
            recipient_id: ID of the user or contractor
            notification_type: Type of notification (task, incident, etc.)
            title: Short notification title
            body: Optional longer description
            data: Optional JSON data for deep-linking (e.g., {"task_id": 123})

        Returns:
            Created Notification object
        """
        notification = Notification(
            company_id=company_id,
            user_id=recipient_id if recipient_type == "user" else None,
            contractor_id=recipient_id if recipient_type == "contractor" else None,
            type=notification_type,
            title=title,
            body=body,
            data=data or {},
        )

        self.db.add(notification)
        self.db.flush()

        return notification

    def notify_user(
        self,
        user: User,
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> Notification:
        """Convenience method to notify a user directly"""
        return self.notify(
            company_id=user.company_id,
            recipient_type="user",
            recipient_id=user.id,
            notification_type=notification_type,
            title=title,
            body=body,
            data=data,
        )

    def notify_contractor(
        self,
        contractor: Contractor,
        company_id: int,
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> Notification:
        """Convenience method to notify a contractor directly"""
        return self.notify(
            company_id=company_id,
            recipient_type="contractor",
            recipient_id=contractor.id,
            notification_type=notification_type,
            title=title,
            body=body,
            data=data,
        )

    # ============================================
    # Bulk notifications
    # ============================================

    def notify_role(
        self,
        company_id: int,
        role: Literal["admin", "manager"],
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> List[Notification]:
        """
        Notify all users with a specific role in a company.

        Args:
            company_id: Company to notify within
            role: Role to target ("admin" or "manager")
            notification_type: Type of notification
            title: Notification title
            body: Optional description
            data: Optional deep-link data

        Returns:
            List of created Notification objects
        """
        users = self.db.query(User).filter(
            User.company_id == company_id,
            User.role == role,
            User.is_active == True,
        ).all()

        notifications = []
        for user in users:
            notification = self.notify(
                company_id=company_id,
                recipient_type="user",
                recipient_id=user.id,
                notification_type=notification_type,
                title=title,
                body=body,
                data=data,
            )
            notifications.append(notification)

        return notifications

    def notify_managers(
        self,
        company_id: int,
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> List[Notification]:
        """Convenience method to notify all managers in a company"""
        return self.notify_role(
            company_id=company_id,
            role="manager",
            notification_type=notification_type,
            title=title,
            body=body,
            data=data,
        )

    def notify_admins(
        self,
        company_id: int,
        notification_type: NotificationType,
        title: str,
        body: Optional[str] = None,
        data: Optional[dict] = None,
    ) -> List[Notification]:
        """Convenience method to notify all admins in a company"""
        return self.notify_role(
            company_id=company_id,
            role="admin",
            notification_type=notification_type,
            title=title,
            body=body,
            data=data,
        )

    # ============================================
    # Query methods
    # ============================================

    def get_notifications(
        self,
        company_id: int,
        user_id: Optional[int] = None,
        contractor_id: Optional[int] = None,
        unread_only: bool = False,
        limit: int = 100,
    ) -> List[Notification]:
        """
        Get notifications for a user or contractor.
        Returns most recent first, limited to `limit` records.
        """
        query = self.db.query(Notification).filter(
            Notification.company_id == company_id
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)
        elif contractor_id:
            query = query.filter(Notification.contractor_id == contractor_id)
        else:
            raise ValueError("Either user_id or contractor_id must be provided")

        if unread_only:
            query = query.filter(Notification.is_read == False)

        return query.order_by(desc(Notification.created_at)).limit(limit).all()

    def get_unread_count(
        self,
        company_id: int,
        user_id: Optional[int] = None,
        contractor_id: Optional[int] = None,
    ) -> int:
        """Get count of unread notifications for a user or contractor"""
        query = self.db.query(Notification).filter(
            Notification.company_id == company_id,
            Notification.is_read == False,
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)
        elif contractor_id:
            query = query.filter(Notification.contractor_id == contractor_id)
        else:
            raise ValueError("Either user_id or contractor_id must be provided")

        return query.count()

    def get_total_count(
        self,
        company_id: int,
        user_id: Optional[int] = None,
        contractor_id: Optional[int] = None,
    ) -> int:
        """Get total count of notifications for a user or contractor"""
        query = self.db.query(Notification).filter(
            Notification.company_id == company_id
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)
        elif contractor_id:
            query = query.filter(Notification.contractor_id == contractor_id)
        else:
            raise ValueError("Either user_id or contractor_id must be provided")

        return query.count()

    # ============================================
    # Mark as read
    # ============================================

    def mark_as_read(
        self,
        notification_id: int,
        company_id: int,
        user_id: Optional[int] = None,
        contractor_id: Optional[int] = None,
    ) -> Optional[Notification]:
        """Mark a single notification as read"""
        query = self.db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.company_id == company_id,
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)
        elif contractor_id:
            query = query.filter(Notification.contractor_id == contractor_id)

        notification = query.first()

        if notification and not notification.is_read:
            notification.is_read = True
            notification.read_at = datetime.now(timezone.utc)
            self.db.flush()

        return notification

    def mark_all_as_read(
        self,
        company_id: int,
        user_id: Optional[int] = None,
        contractor_id: Optional[int] = None,
    ) -> int:
        """
        Mark all unread notifications as read for a user or contractor.
        Returns the number of notifications marked as read.
        """
        query = self.db.query(Notification).filter(
            Notification.company_id == company_id,
            Notification.is_read == False,
        )

        if user_id:
            query = query.filter(Notification.user_id == user_id)
        elif contractor_id:
            query = query.filter(Notification.contractor_id == contractor_id)
        else:
            raise ValueError("Either user_id or contractor_id must be provided")

        now = datetime.now(timezone.utc)
        count = query.update(
            {"is_read": True, "read_at": now},
            synchronize_session=False
        )

        return count
