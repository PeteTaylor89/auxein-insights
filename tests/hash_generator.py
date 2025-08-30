from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
new_hash = pwd_context.hash("Monkey123")  # Note the capital M
print(f"New hash: {new_hash}")