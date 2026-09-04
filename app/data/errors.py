"""Data-layer error hierarchy (architecture ``#74``)."""
from __future__ import annotations


class DataLayerError(Exception):
    """Base class for all data-layer errors."""


class DataProviderError(DataLayerError):
    """Provider failed for a non-rate reason."""


class ProviderRateLimitError(DataProviderError):
    """Provider explicitly signaled a rate-limit condition."""


class ProviderUnavailableError(DataProviderError):
    """Provider is down / geo-blocked / unreachable."""


class DownloadError(DataLayerError):
    """Download pipeline failed."""


class NormalizationError(DataLayerError):
    """Source data could not be normalized to the canonical schema."""


class ValidationError(DataLayerError):
    """Dataset failed validation (rejected, not stored)."""


class DatasetNotFoundError(DataLayerError):
    """Requested dataset does not exist locally."""


class DatasetCoverageError(DataLayerError):
    """Coverage could not be computed / requested range is invalid."""