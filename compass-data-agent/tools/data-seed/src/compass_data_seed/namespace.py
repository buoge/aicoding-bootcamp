"""Map the logical core/ops/sec contract into one explicitly owned physical schema.

SQL string literals, quoted data, and comments retain their contents. Dollar-quoted
SQL function bodies are recursively mapped. Parameters are never rewritten.
"""

import re

from psycopg import sql

TOKEN = re.compile(
    r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\$([A-Za-z_][A-Za-z_0-9]*|)\$[\s\S]*?\$\1\$|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*|\s+|."
)


def physical_schema(value):
    if not re.fullmatch(r"retail_[a-z0-9_]{1,40}", value) or value in {
        "core",
        "ops",
        "sec",
        "public",
    }:
        raise ValueError("Schema must be an explicit new retail_* namespace")
    return value


def remap(query, schema):
    physical_schema(schema)
    tokens = [m.group() for m in TOKEN.finditer(query)]
    for i, token in enumerate(tokens):
        if token.startswith("$") and token.count("$") >= 4:
            delimiter = token[: token.index("$", 1) + 1]
            tokens[i] = (
                delimiter + remap(token[len(delimiter) : -len(delimiter)], schema) + delimiter
            )
        elif token.strip('"') in {"core", "ops", "sec"}:
            next_index = i + 1
            while next_index < len(tokens) and tokens[next_index].isspace():
                next_index += 1
            if next_index < len(tokens) and tokens[next_index] == ".":
                tokens[i] = '"' + schema + '"'
    return "".join(tokens)


class MappedCursor:
    def __init__(self, cursor, connection):
        self.raw, self.connection = cursor, connection

    def execute(self, query, *args, **kwargs):
        self.raw.execute(self.connection.query(query), *args, **kwargs)
        return self

    def executemany(self, query, *args, **kwargs):
        return self.raw.executemany(self.connection.query(query), *args, **kwargs)

    def copy(self, query, *args, **kwargs):
        return self.raw.copy(self.connection.query(query), *args, **kwargs)

    def __enter__(self):
        self.raw.__enter__()
        return self

    def __exit__(self, *args):
        return self.raw.__exit__(*args)

    def __getattr__(self, name):
        return getattr(self.raw, name)

    def __iter__(self):
        return iter(self.raw)


class MappedConnection:
    def __init__(self, connection, schema):
        self.raw, self.schema = connection, physical_schema(schema)

    def query(self, query):
        if isinstance(query, sql.Composable):
            query = query.as_string(self.raw)
        if not isinstance(query, str):
            raise TypeError("SQL must be a string or psycopg Composable")
        return remap(query, self.schema)

    def execute(self, query, *args, **kwargs):
        return self.raw.execute(self.query(query), *args, **kwargs)

    def cursor(self, *args, **kwargs):
        return MappedCursor(self.raw.cursor(*args, **kwargs), self)

    def __getattr__(self, name):
        return getattr(self.raw, name)


def mapped(connection, record):
    return MappedConnection(connection, record["schema"]) if record.get("schema") else connection
