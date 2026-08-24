import re
from typing import Any

from fastapi import HTTPException, status

from app.models import BodyFontKey, CardStyleKey, DigitalMenu, HeadingFontKey

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

DEFAULT_MENU_THEME = {
    "accent_color": "#955F32",
    "background_color": "#F6F0E8",
    "surface_color": "#FFF7EE",
    "text_color": "#241711",
    "muted_text_color": "#6F6258",
    "heading_font": HeadingFontKey.editorial,
    "body_font": BodyFontKey.clean,
    "card_style": CardStyleKey.rounded,
}


def theme_payload_from_menu(menu: DigitalMenu) -> dict[str, Any]:
    return {
        "accent_color": menu.accent_color,
        "background_color": menu.background_color,
        "surface_color": menu.surface_color,
        "text_color": menu.text_color,
        "muted_text_color": menu.muted_text_color,
        "heading_font": menu.heading_font,
        "body_font": menu.body_font,
        "card_style": menu.card_style,
    }


def validate_theme_readability(
    *,
    background_color: str,
    surface_color: str,
    text_color: str,
    muted_text_color: str,
) -> None:
    contrast_pairs = (
        ("text_color", text_color, background_color, 2.6),
        ("text_color", text_color, surface_color, 2.6),
        ("muted_text_color", muted_text_color, background_color, 1.9),
        ("muted_text_color", muted_text_color, surface_color, 1.9),
    )
    for field_name, foreground, background, minimum in contrast_pairs:
        if _contrast_ratio(foreground, background) < minimum:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} contrast is too low",
            )


def _contrast_ratio(foreground: str, background: str) -> float:
    lighter = max(_relative_luminance(foreground), _relative_luminance(background))
    darker = min(_relative_luminance(foreground), _relative_luminance(background))
    return (lighter + 0.05) / (darker + 0.05)


def _relative_luminance(color: str) -> float:
    red = int(color[1:3], 16) / 255
    green = int(color[3:5], 16) / 255
    blue = int(color[5:7], 16) / 255
    channels = [_linearize(red), _linearize(green), _linearize(blue)]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _linearize(channel: float) -> float:
    if channel <= 0.03928:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4
