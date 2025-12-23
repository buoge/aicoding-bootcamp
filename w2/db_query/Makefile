PY := python
FRONTEND_DIR := frontend
BACKEND_DIR := backend
BACKEND_ENV := $(BACKEND_DIR)/.venv
SQLITE_PATH := $(HOME)/.db_query/db_query.db

.PHONY: help backend-env backend-install backend-run frontend-install frontend-dev clean

help:
	@echo "make backend-env      # Create backend venv (.venv)"
	@echo "make backend-install  # Install backend deps into venv"
	@echo "make backend-run      # Run backend with uvicorn"
	@echo "make frontend-install # Install frontend deps"
	@echo "make frontend-dev     # Run frontend dev server"
	@echo "make clean            # Remove backend venv and node_modules"

backend-env:
	@test -d $(BACKEND_ENV) || $(PY) -m venv $(BACKEND_ENV)

backend-install: backend-env
	. $(BACKEND_ENV)/bin/activate && pip install -r $(BACKEND_DIR)/requirements.txt

backend-run:
	. $(BACKEND_ENV)/bin/activate && cd $(BACKEND_DIR) && uvicorn app.main:app --reload

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend-dev:
	cd $(FRONTEND_DIR) && npm run dev

clean:
	rm -rf $(BACKEND_ENV) $(FRONTEND_DIR)/node_modules

