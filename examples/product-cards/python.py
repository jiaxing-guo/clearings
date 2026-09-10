"""A small ASGI endpoint using fake read adapters and the public SDK."""

import json
from urllib.parse import parse_qs

from clearings import ClearingsError, Runtime, flow, operation, s


async def read_product(id, context):
    if id == "A":
        return {"name": "Apple"}
    if id == "B":
        return {"name": "Book"}
    raise ValueError("Unknown product")


async def read_stock(id, context):
    return 3 if id == "A" else 0


catalog = operation(
    id="catalog.product",
    version="fixture-v1",
    input=s.string,
    output=s.object({"name": s.string}),
    execute=read_product,
)
inventory = operation(
    id="inventory.stock", version="fixture-v1", input=s.string, output=s.number, execute=read_stock
)
product_cards = flow(
    "product-cards",
    lambda q, ids: q.map(
        ids,
        lambda id: q.transform(
            q.join({"product": q.call(catalog, id), "stock": q.call(inventory, id)}),
            lambda value: {"name": value["product"]["name"], "available": value["stock"] > 0},
        ),
    ),
)


def create_app(runtime=None):
    runtime = runtime or Runtime(max_in_flight=16, build="product-cards-fixture-v1")

    async def application(scope, receive, send):
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    runtime.close()
                    await runtime.drain()
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        elif scope["type"] == "http":
            request = await receive()
            if request["type"] == "http.disconnect":
                return
            ids = parse_qs(scope.get("query_string", b"").decode("ascii")).get("id", [])
            try:
                result = await runtime.run(product_cards, ids, timeout_ms=1000)
                status = 200
            except ClearingsError:
                result = {"error": "Product cards unavailable"}
                status = 503
            await send(
                {
                    "type": "http.response.start",
                    "status": status,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": json.dumps(result).encode()})
        else:
            raise ValueError("This example supports HTTP and lifespan scopes.")

    return application


app = create_app()
