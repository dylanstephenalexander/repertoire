from fastapi import APIRouter, HTTPException, Request
from app.main import limiter

from app.models.opening import OpeningSummary, VariationTree
from app.services.openings import get_variation_tree, list_openings

router = APIRouter(prefix="/openings", tags=["openings"])


@router.get("", response_model=list[OpeningSummary])
@limiter.limit("60/minute")
async def get_openings(request: Request) -> list[OpeningSummary]:
    return list_openings()


@router.get("/{opening_id}/variations/{variation_id}/tree", response_model=VariationTree)
@limiter.limit("30/minute")
async def get_tree(request: Request, opening_id: str, variation_id: str) -> VariationTree:
    tree = get_variation_tree(opening_id, variation_id)
    if tree is None:
        raise HTTPException(
            status_code=404,
            detail=f"No tree for '{opening_id}/{variation_id}'",
        )
    return tree
