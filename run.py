# -*- coding: utf-8 -*-
"""
Created on Wed Apr 16 21:42:08 2025

@author: Peter Taylor
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)