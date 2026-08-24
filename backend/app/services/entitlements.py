from fastapi import HTTPException, status

from app.models import Business, BusinessFeatureKey, BusinessPlanKey

PLAN_FEATURES: dict[BusinessPlanKey, dict[BusinessFeatureKey, bool]] = {
    BusinessPlanKey.essential: {
        BusinessFeatureKey.digital_menu: False,
        BusinessFeatureKey.artistic_qr: False,
        BusinessFeatureKey.advanced_analytics: False,
        BusinessFeatureKey.scheduled_promotions: False,
        BusinessFeatureKey.advanced_branding: False,
    },
    BusinessPlanKey.premium: {
        BusinessFeatureKey.digital_menu: True,
        BusinessFeatureKey.artistic_qr: False,
        BusinessFeatureKey.advanced_analytics: False,
        BusinessFeatureKey.scheduled_promotions: False,
        BusinessFeatureKey.advanced_branding: False,
    },
}


def _feature_overrides_for_business(_business: Business) -> dict[BusinessFeatureKey, bool]:
    # Future layer: business-level promotional or contractual overrides can merge here
    # without changing callers that currently depend on the plan mapping.
    return {}


def plan_includes_feature(plan_key: BusinessPlanKey, feature: BusinessFeatureKey | str) -> bool:
    feature_key = BusinessFeatureKey(feature)
    plan_features = PLAN_FEATURES.get(plan_key, PLAN_FEATURES[BusinessPlanKey.essential])
    return plan_features.get(feature_key, False)


def get_business_feature_flags(business: Business) -> dict[str, bool]:
    plan_features = PLAN_FEATURES.get(business.plan_key, PLAN_FEATURES[BusinessPlanKey.essential])
    merged = {feature: enabled for feature, enabled in plan_features.items()}
    merged.update(_feature_overrides_for_business(business))
    return {feature.value: enabled for feature, enabled in merged.items()}


def business_has_feature(business: Business, feature: BusinessFeatureKey | str) -> bool:
    feature_key = BusinessFeatureKey(feature)
    override = _feature_overrides_for_business(business).get(feature_key)
    if override is not None:
        return override
    return plan_includes_feature(business.plan_key, feature_key)


def require_business_feature(business: Business, feature: BusinessFeatureKey | str) -> None:
    feature_key = BusinessFeatureKey(feature)
    if business_has_feature(business, feature_key):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Feature not enabled: {feature_key.value}",
    )
