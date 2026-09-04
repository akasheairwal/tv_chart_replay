"""Canonical dataset validation (architecture ``#19``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import polars as pl

from app.data.models.candle import CANONICAL_COLUMNS


class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class ValidationStatus(str, Enum):
    VALID = "valid"
    WARN = "warn"
    INVALID = "invalid"


@dataclass
class ValidationIssue:
    code: str
    severity: Severity
    detail: str
    timestamp: int | None = None
    row_index: int | None = None


@dataclass
class ValidationReport:
    status: ValidationStatus
    total_rows: int
    valid_rows: int
    quarantined_rows: int
    issues: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)


def _validity_mask(frame: pl.DataFrame) -> pl.Series:
    # Missing/NaN volume is common and legitimate (many indices publish no
    # volume); treat it as zero instead of quarantining the row. Only the
    # prices must be finite.
    finite = (
        pl.col("open").is_finite()
        & pl.col("high").is_finite()
        & pl.col("low").is_finite()
        & pl.col("close").is_finite()
    )
    structure = (
        (pl.col("high") >= pl.max_horizontal("open", "close"))
        & (pl.col("low") <= pl.min_horizontal("open", "close"))
        & (pl.col("high") >= pl.col("low"))
        & (pl.col("volume").is_finite() | pl.col("volume").is_null())
        & (pl.col("volume").is_null() | (pl.col("volume") >= 0))
        & pl.col("timestamp").is_not_null()
    )
    return frame.select((finite & structure).fill_null(False).alias("__ok")).to_series()


def validate(frame: pl.DataFrame) -> tuple[pl.DataFrame, ValidationReport]:
    """Validate a canonical frame.

    Returns ``(clean_frame, report)``.  Invalid rows are quarantined
    (excluded); more than 50% invalid rows marks the dataset INVALID.
    """
    df = frame.select(CANONICAL_COLUMNS) if frame.height else frame
    total = df.height
    mask = _validity_mask(df)

    quarantined = df.filter(~mask)
    clean = (
        df.filter(mask)
        # Null/NaN volume is legitimate (indices); normalize to 0 so
        # downstream math and storage never see non-finite volume.
        .with_columns(
            pl.when(pl.col("volume").is_finite())
            .then(pl.col("volume"))
            .otherwise(0.0)
            .alias("volume")
        )
        .sort("timestamp", maintain_order=True)
        .unique(subset=["timestamp"], keep="last")
        .sort("timestamp")
    )

    # Sample issues from quarantined rows (cap the detail volume).
    issues: list[ValidationIssue] = []
    for row in quarantined.select(["timestamp"]).head(20).iter_rows():
        issues.append(
            ValidationIssue(
                code="invalid_row",
                severity=Severity.ERROR,
                detail="OHLCV structural or finiteness check failed",
                timestamp=row[0],
            )
        )

    quarantine_ratio = quarantined.height / total if total else 0.0
    if quarantine_ratio > 0.5:
        status = ValidationStatus.INVALID
    elif quarantined.height > 0:
        status = ValidationStatus.WARN
    else:
        status = ValidationStatus.VALID

    return clean, ValidationReport(
        status=status,
        total_rows=total,
        valid_rows=clean.height,
        quarantined_rows=quarantined.height,
        issues=issues,
        warnings=[i for i in issues if i.severity == Severity.WARNING],
    )