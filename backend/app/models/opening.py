from pydantic import BaseModel


class VariationSummary(BaseModel):
    id: str
    name: str


class OpeningSummary(BaseModel):
    id: str
    name: str
    color: str  # "white" | "black"
    variations: list[VariationSummary]


class VariationTree(BaseModel):
    id: str
    opening_id: str
    name: str
    color: str
    moves: dict  # nested UCI move trie
