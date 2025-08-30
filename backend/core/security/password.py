import re
from passlib.context import CryptContext
import secrets
import string

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def validate_password(password: str) -> bool:
    """
    Password must:
    - Be at least 8 characters long
    - Contain at least one digit
    - Contain at least one uppercase letter
    """
    if len(password) < 8:
        return False
    if not re.search(r"\d", password):  # At least one digit
        return False
    if not re.search(r"[A-Z]", password):  # At least one uppercase
        return False
    return True

def generate_random_password(length: int = 12) -> str:
    """
    Generate a secure random password.
    
    Args:
        length: Password length (minimum 8, default 12)
    
    Returns:
        A secure random password containing uppercase, lowercase, digits, and symbols
    """
    if length < 8:
        length = 8
    
    # Define character sets
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    symbols = "!@#$%&*"  # Limited symbols for easier typing
    
    # Ensure at least one character from each set
    password = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(symbols)
    ]
    
    # Fill the rest randomly
    all_chars = lowercase + uppercase + digits + symbols
    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))
    
    # Shuffle the password
    secrets.SystemRandom().shuffle(password)
    
    return ''.join(password)

def is_password_strong(password: str) -> tuple[bool, list[str]]:
    """
    Check if a password meets strength requirements.
    
    Returns:
        (is_strong, list_of_issues)
    """
    issues = []
    
    if len(password) < 8:
        issues.append("Password must be at least 8 characters long")
    
    if not any(c.islower() for c in password):
        issues.append("Password must contain at least one lowercase letter")
    
    if not any(c.isupper() for c in password):
        issues.append("Password must contain at least one uppercase letter")
    
    if not any(c.isdigit() for c in password):
        issues.append("Password must contain at least one number")
    
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        issues.append("Password must contain at least one special character")
    
    return len(issues) == 0, issues