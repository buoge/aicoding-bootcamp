"""Idempotent insertion of fixed, synthetic fixture rows. No customer data."""

from datetime import date

from sqlalchemy.orm import Session

from compass_agent.database import DemoSale, get_engine

FIXTURE = [
    (date(2026, 10, 1), 1280000, 128),
    (date(2026, 10, 2), 1530000, 150),
    (date(2026, 10, 3), 1190000, 119),
]


def seed(session: Session) -> None:
    for day, revenue, orders in FIXTURE:
        session.merge(DemoSale(day=day, revenue_minor=revenue, orders=orders))
    session.commit()


def main() -> None:
    with Session(get_engine()) as session:
        seed(session)
    print("Compass synthetic fixture ready (3 days).")


if __name__ == "__main__":
    main()
