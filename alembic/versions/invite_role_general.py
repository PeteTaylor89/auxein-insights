"""Let an invitation carry the General (H&S) role.

## What this fixes

`chk_invitation_role` allowed `('owner', 'admin', 'manager', 'user', 'viewer')`.
Nothing in the application had agreed with that list for a long time:

- `owner` and `viewer` were offered by the web UI but rejected by the pydantic
  validator with a 422, so **no invitation ever carried either** — verified on
  prod before writing this: the only roles present are admin, manager and user.
- `general` — the health-and-safety account added for W4 — is what the app now
  needs to write, and the constraint refused it with an IntegrityError.

So the database was the one place the two dead roles were ever real, and it was
also the one place the live role was missing.

## Why dropping owner/viewer is safe

Zero rows carry them. The deployed backend only ever writes admin, manager or
user, all of which stay allowed, so this can be applied ahead of the code that
writes `general` without breaking anything that is currently running.

The list is mirrored in `db/models/invitation.py.__table_args__` and derived in
`core/permissions.ASSIGNABLE_ROLES`. A role added in one place and not the
others fails at the INSERT, which is the failure this migration exists to fix.
"""
from alembic import op

revision = 'invite_role_general'
down_revision = 'site_attendance'
branch_labels = None
depends_on = None

CONSTRAINT = 'chk_invitation_role'
TABLE = 'invitations'

# Kept in step with core.permissions.ASSIGNABLE_ROLES.
NEW_ROLES = ('admin', 'manager', 'user', 'general')
OLD_ROLES = ('owner', 'admin', 'manager', 'user', 'viewer')


def _in_list(roles):
    return ", ".join(f"'{r}'" for r in roles)


def upgrade():
    op.drop_constraint(CONSTRAINT, TABLE, type_='check')
    op.create_check_constraint(
        CONSTRAINT, TABLE, f"role IN ({_in_list(NEW_ROLES)})"
    )


def downgrade():
    # Any `general` invitation would violate the restored constraint, so clear
    # it first. Downgrading past this point means the app cannot express the
    # H&S account at all, and a pending invitation for one is meaningless.
    op.execute(
        f"UPDATE {TABLE} SET status = 'cancelled' "
        f"WHERE role = 'general' AND status = 'pending'"
    )
    op.execute(f"DELETE FROM {TABLE} WHERE role = 'general'")
    op.drop_constraint(CONSTRAINT, TABLE, type_='check')
    op.create_check_constraint(
        CONSTRAINT, TABLE, f"role IN ({_in_list(OLD_ROLES)})"
    )
