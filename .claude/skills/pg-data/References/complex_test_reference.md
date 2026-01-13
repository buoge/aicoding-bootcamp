# complex_test Database Reference

**Database Name**: complex_test
**Host**: localhost
**Port**: 5432
**Last Updated**: 2026-01-13

## Database Overview
This is a complex test database with PostGIS extension enabled, containing spatial data types and metadata tables.

## Schema Information

### Tables

#### spatial_ref_sys
Stores information about spatial reference systems (coordinate systems).

| Column | Type | Description |
|--------|------|-------------|
| srid | INTEGER | Spatial Reference System ID (Primary Key) |
| auth_name | VARCHAR(256) | Authority name (e.g., 'EPSG') |
| auth_srid | INTEGER | Authority's SRID |
| srtext | VARCHAR(2048) | Spatial reference system WKT text |
| proj4text | VARCHAR(2048) | PROJ.4 projection parameters |

**Indexes:**
- PRIMARY KEY: `spatial_ref_sys_pkey` (srid)

---

### Views

#### geography_columns
View showing geography columns in the database.

#### geometry_columns
View showing geometry columns in the database.

---

### Custom Data Types

| Type Name | Description |
|-----------|-------------|
| box2d | 2-dimensional bounding box |
| box2df | 2-dimensional floating box |
| box3d | 3-dimensional bounding box |
| geography | Geographic coordinates (latitude/longitude) |
| geometry | Geometric/Geographic spatial data |
| geometry_dump | Composite type for geometry dumps |
| ghstore | Generalized hstore extension |
| gidx | Generalized index type |
| gtrgm | Trigram type for text search |
| hstore | Key-value store type |
| spheroid | Spheroid definition for ellipsoids |
| valid_detail | Validation details for geometries |

---

### Indexes

| Index Name | Table | Columns | Type | Definition |
|------------|-------|---------|------|------------|
| spatial_ref_sys_pkey | spatial_ref_sys | srid | btree | UNIQUE INDEX |

---

## PostGIS Extension
This database has PostGIS extension installed, enabling spatial data storage and operations.

## Common Queries

### List all spatial reference systems
```sql
SELECT srid, auth_name, auth_srid, srtext
FROM spatial_ref_sys
ORDER BY srid
LIMIT 10;
```

### Find a specific spatial reference system
```sql
SELECT * FROM spatial_ref_sys WHERE srid = 4326;
```

### Count spatial reference systems
```sql
SELECT COUNT(*) FROM spatial_ref_sys;
```

---

## Notes
- Database has PostGIS extension enabled
- Contains spatial reference system metadata
- Suitable for testing spatial queries and geographic data operations
