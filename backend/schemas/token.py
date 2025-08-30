# -*- coding: utf-8 -*-
"""
Created on Thu May  1 19:51:53 2025

@author: Peter Taylor
"""

from typing import Optional
from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class EnhancedToken(Token):
    """Enhanced token response with user type and metadata"""
    user_type: str  # "company_user" | "contractor"
    user_id: int
    username: str
    full_name: Optional[str] = None
    role: Optional[str] = None  # Only for company users
    company_id: Optional[int] = None  # For company users
    company_ids: Optional[list[int]] = None  # For contractors

class TokenData(BaseModel):
    username: Optional[str] = None
    user_type: Optional[str] = None
    client_type: Optional[str] = None
    role: Optional[str] = None
    company_id: Optional[int] = None
    company_ids: Optional[list[int]] = None
    contractor_id: Optional[int] = None