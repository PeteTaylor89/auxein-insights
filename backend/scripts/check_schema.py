import os
from sqlalchemy import create_engine, inspect
from backend.db.base_class import Base  # import your declarative Base
from dotenv import load_dotenv

def run_check():
    load_dotenv()  # loads variables from .env into environment
    db_url = os.getenv("DATABASE_URL")

    if not db_url:
        raise RuntimeError("❌ DATABASE_URL not set in .env")

    engine = create_engine(db_url)
    insp = inspect(engine)

    issues = []

    for table_name, table in Base.metadata.tables.items():
        if not insp.has_table(table_name):
            issues.append(f"❌ Table missing in DB: {table_name}")
            continue

        db_cols = {col['name']: col for col in insp.get_columns(table_name)}
        model_cols = {col.name: col for col in table.columns}

        for col_name, model_col in model_cols.items():
            if col_name not in db_cols:
                issues.append(f"❌ Column missing in DB: {table_name}.{col_name}")
            else:
                db_col = db_cols[col_name]
                # Compare type + nullability
                if str(model_col.type) != str(db_col['type']):
                    issues.append(
                        f"⚠️ Type mismatch {table_name}.{col_name}: "
                        f"Model={model_col.type}, DB={db_col['type']}"
                    )
                if model_col.nullable != db_col['nullable']:
                    issues.append(
                        f"⚠️ Nullability mismatch {table_name}.{col_name}: "
                        f"Model={model_col.nullable}, DB={db_col['nullable']}"
                    )

    return issues


if __name__ == "__main__":
    problems = run_check()
    if problems:
        print("\n".join(problems))
    else:
        print("✅ Schema matches models")
