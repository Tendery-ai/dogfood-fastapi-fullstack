import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import Item, ItemCreate
from tests.utils.item import create_random_item
from tests.utils.user import create_random_user
from tests.utils.utils import random_lower_string


def test_create_item(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"title": "Foo", "description": "Fighters"}
    response = client.post(
        f"{settings.API_V1_STR}/items/",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert content["description"] == data["description"]
    assert "id" in content
    assert "owner_id" in content


def test_read_item(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    response = client.get(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == item.title
    assert content["description"] == item.description
    assert content["id"] == str(item.id)
    assert content["owner_id"] == str(item.owner_id)


def test_read_item_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/items/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    content = response.json()
    assert content["detail"] == "Item not found"


def test_read_item_not_enough_permissions(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    response = client.get(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403
    content = response.json()
    assert content["detail"] == "Not enough permissions"


def test_read_items(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_item(db)
    create_random_item(db)
    response = client.get(
        f"{settings.API_V1_STR}/items/",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert len(content["data"]) >= 2


def test_update_item(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    data = {"title": "Updated title", "description": "Updated description"}
    response = client.put(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert content["description"] == data["description"]
    assert content["id"] == str(item.id)
    assert content["owner_id"] == str(item.owner_id)


def test_update_item_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"title": "Updated title", "description": "Updated description"}
    response = client.put(
        f"{settings.API_V1_STR}/items/{uuid.uuid4()}",
        headers=superuser_token_headers,
        json=data,
    )
    assert response.status_code == 404
    content = response.json()
    assert content["detail"] == "Item not found"


def test_update_item_not_enough_permissions(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    data = {"title": "Updated title", "description": "Updated description"}
    response = client.put(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=normal_user_token_headers,
        json=data,
    )
    assert response.status_code == 403
    content = response.json()
    assert content["detail"] == "Not enough permissions"


def test_delete_item(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    response = client.delete(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    content = response.json()
    assert content["message"] == "Item deleted successfully"


def test_delete_item_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    response = client.delete(
        f"{settings.API_V1_STR}/items/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404
    content = response.json()
    assert content["detail"] == "Item not found"


def test_delete_item_not_enough_permissions(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    item = create_random_item(db)
    response = client.delete(
        f"{settings.API_V1_STR}/items/{item.id}",
        headers=normal_user_token_headers,
    )
    assert response.status_code == 403
    content = response.json()
    assert content["detail"] == "Not enough permissions"


def _create_item_for(
    db: Session, owner_id: uuid.UUID, title: str, description: str | None = None
) -> Item:
    return crud.create_item(
        session=db,
        item_in=ItemCreate(title=title, description=description),
        owner_id=owner_id,
    )


def _search(
    client: TestClient, headers: dict[str, str], **params: str | int
) -> dict[str, Any]:
    response = client.get(
        f"{settings.API_V1_STR}/items/", headers=headers, params=params
    )
    assert response.status_code == 200
    content: dict[str, Any] = response.json()
    return content


def test_read_items_search_title_and_description_case_insensitive(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    token = random_lower_string()[:12]
    owner = create_random_user(db)
    by_title = _create_item_for(db, owner.id, f"Foo-{token}-Bar", "nothing")
    by_description = _create_item_for(db, owner.id, "unrelated", f"xx {token} yy")
    _create_item_for(db, owner.id, "other title", "other description")

    for keyword in (token, token.upper(), token.capitalize()):
        content = _search(client, superuser_token_headers, q=keyword)
        assert content["count"] == 2
        assert {i["id"] for i in content["data"]} == {
            str(by_title.id),
            str(by_description.id),
        }


def test_read_items_search_no_match_and_blank_keyword(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    create_random_item(db)
    content = _search(client, superuser_token_headers, q="no-such-" + "z" * 20)
    assert content == {"data": [], "count": 0}

    everything = _search(client, superuser_token_headers)
    for blank in ("", "   "):
        content = _search(client, superuser_token_headers, q=blank)
        assert content["count"] == everything["count"]


def test_read_items_search_treats_wildcards_literally(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    token = random_lower_string()[:12]
    owner = create_random_user(db)
    literal = _create_item_for(db, owner.id, f"{token}100%_done")
    _create_item_for(db, owner.id, f"{token}100xxdone")

    content = _search(client, superuser_token_headers, q=f"{token}100%_")
    assert [i["id"] for i in content["data"]] == [str(literal.id)]
    assert content["count"] == 1


def test_read_items_search_visibility_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    token = random_lower_string()[:12]
    me = crud.get_user_by_email(session=db, email=settings.EMAIL_TEST_USER)
    assert me
    other = create_random_user(db)
    mine = _create_item_for(db, me.id, f"mine {token}")
    _create_item_for(db, other.id, f"theirs {token}")

    content = _search(client, normal_user_token_headers, q=token.upper())
    assert [i["id"] for i in content["data"]] == [str(mine.id)]
    assert content["count"] == 1


def test_read_items_search_visibility_superuser_sees_all(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    token = random_lower_string()[:12]
    first, second = create_random_user(db), create_random_user(db)
    _create_item_for(db, first.id, f"a {token}")
    _create_item_for(db, second.id, f"b {token}")

    content = _search(client, superuser_token_headers, q=token)
    assert content["count"] == 2
    assert {i["owner_id"] for i in content["data"]} == {
        str(first.id),
        str(second.id),
    }


def test_read_items_search_count_is_total_with_paging(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    token = random_lower_string()[:12]
    owner = create_random_user(db)
    created = [_create_item_for(db, owner.id, f"{token} {n}") for n in range(5)]
    _create_item_for(db, owner.id, "no match")
    # Newest first
    expected = [str(i.id) for i in reversed(created)]

    page1 = _search(client, superuser_token_headers, q=token, skip=0, limit=2)
    page2 = _search(client, superuser_token_headers, q=token, skip=2, limit=2)
    page3 = _search(client, superuser_token_headers, q=token, skip=4, limit=2)
    assert page1["count"] == page2["count"] == page3["count"] == 5
    assert [i["id"] for i in page1["data"]] == expected[0:2]
    assert [i["id"] for i in page2["data"]] == expected[2:4]
    assert [i["id"] for i in page3["data"]] == expected[4:5]
