"""Row-based seat pricing.

Closer to the stage = more expensive. The mapping is a pure function over
the room geometry already stored in the DB (rows × cols, seat row labels):
no new column, no migration. ``price_tiers`` rows remain the source of
truth for every concrete price; this module only decides *which* tier a
given seat row belongs to.

Bands:
- Front:  first  ~1/3 of rows  (multiplier 1.5×)
- Middle: middle ~1/3 of rows  (multiplier 1.0×)
- Back:   last   ~1/3 of rows  (multiplier 0.7×)

The multipliers are applied off the organiser's submitted ``price_cents``
at proposal-approval time (and at seed time), so the tier prices are
materialised once and never recomputed at request time.
"""

from __future__ import annotations

from collections.abc import Iterable

#: Canonical tier order, front → back. Multipliers are applied to the
#: organiser's submitted base price.
TIER_BANDS: tuple[tuple[str, float], ...] = (
    ("Front", 1.5),
    ("Middle", 1.0),
    ("Back", 0.7),
)

TIER_NAMES: tuple[str, ...] = tuple(name for name, _ in TIER_BANDS)


def tiered_prices(base_cents: int) -> list[tuple[str, int]]:
    """Materialise (tier_name, price_cents) for the standard 3-band layout.

    Prices are rounded to the nearest cent; the multiplier table is the
    only place the ratios live.
    """
    return [(name, int(round(base_cents * mult))) for name, mult in TIER_BANDS]


def split_capacity(seats: int) -> dict[str, int]:
    """Distribute a total seat count across Front/Middle/Back.

    Returns a dict whose values sum to ``seats``. We give the remainder to
    Back so Front + Middle stay at exactly ⌊seats/3⌋ each (matches how the
    band-from-row function below partitions the row index space).
    """
    third = seats // 3
    return {"Front": third, "Middle": third, "Back": seats - 2 * third}


def band_for_row_index(row_index: int, total_rows: int) -> str:
    """0-based row index → tier name. Rows 0..⌊n/3⌋-1 are Front, etc."""
    if total_rows <= 0:
        return "Middle"
    third = max(1, total_rows // 3)
    if row_index < third:
        return "Front"
    if row_index < 2 * third:
        return "Middle"
    return "Back"


def band_for_row_label(row_label: str, sorted_row_labels: Iterable[str]) -> str:
    """Map a row label (e.g. "B") to a tier given the room's sorted row labels.

    Falls back to ``"Middle"`` if the label is not in the room (shouldn't
    happen — every seat we see is from the same room — but the guard
    keeps callers from blowing up on dirty data).
    """
    rows = list(sorted_row_labels)
    try:
        idx = rows.index(row_label)
    except ValueError:
        return "Middle"
    return band_for_row_index(idx, len(rows))


__all__ = [
    "TIER_BANDS",
    "TIER_NAMES",
    "band_for_row_index",
    "band_for_row_label",
    "split_capacity",
    "tiered_prices",
]
