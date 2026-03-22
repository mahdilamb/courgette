"""Tests for multi-language parsing."""

from __future__ import annotations

from courgette.core.parser import parse


def test_parse_french() -> None:
    text = """# language: fr
Fonctionnalité: Calculatrice
  Scénario: Addition
    Soit j'ai le nombre 5
    Quand j'additionne
    Alors le résultat est 8
"""
    feature = parse(text)
    assert feature["language"] == "fr"
    assert feature["name"] == "Calculatrice"
    assert len(feature["children"]) == 1
