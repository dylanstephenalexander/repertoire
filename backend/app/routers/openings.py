from fastapi import APIRouter, HTTPException

from app.models.opening import OpeningSummary, VariationTree
from app.services.openings import get_variation_tree, list_openings

router = APIRouter(prefix="/openings", tags=["openings"])


@router.get("", response_model=list[OpeningSummary])
def get_openings() -> list[OpeningSummary]:
    return list_openings()


@router.get("/{opening_id}/variations/{variation_id}/tree", response_model=VariationTree)
def get_tree(opening_id: str, variation_id: str) -> VariationTree:
    tree = get_variation_tree(opening_id, variation_id)
    if tree is None:
        raise HTTPException(
            status_code=404,
            detail=f"No tree for '{opening_id}/{variation_id}'",
        )
    return tree
