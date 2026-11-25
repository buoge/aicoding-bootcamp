"""Dedicated retail migration set, reachable only through a registered candidate."""

from alembic import context

connection = context.config.attributes.get("connection")
if connection is None:
    raise RuntimeError("Use the retail importer with an explicitly registered candidate connection")
context.configure(connection=connection)
with context.begin_transaction():
    context.run_migrations()
