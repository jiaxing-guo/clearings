from clearings import flow, operation, s


def case_flow(kind, observe=lambda *args: None):
    def op(id, input, output, fn):
        async def execute(value, context):
            observe(id, value)
            return fn(value)

        return operation(id=id, version="fixture-v1", input=input, output=output, execute=execute)

    def product(id):
        if id == "A":
            return {"name": "Apple"}
        if id == "B":
            return {"name": "Book"}
        raise RuntimeError("private provider detail")

    catalog = op("catalog", s.string, s.object({"name": s.string}), product)
    stock = op("stock", s.string, s.number, lambda id: 3 if id == "A" else 0)
    inc = op("inc", s.number, s.number, lambda x: x + 1)
    double = op("double", s.number, s.number, lambda x: x * 2)

    def build(q, input):
        if kind == "value":
            return q.value(input)
        if kind == "cards":
            return q.map(
                input,
                lambda id: q.transform(
                    q.join({"product": q.call(catalog, id), "stock": q.call(stock, id)}),
                    lambda x: {"name": x["product"]["name"], "available": x["stock"] > 0},
                ),
            )
        if kind == "dependency":
            return q.call(double, q.call(inc, input))
        if kind == "shared":
            ref = q.call(inc, input)
            return q.join([ref, q.transform(ref, lambda v: v * 2)])
        if kind == "failure":
            return q.call(catalog, input)
        if kind == "transform_failure":

            def fail(value):
                raise RuntimeError("private transform detail")

            return q.transform(q.value(input), fail)
        raise AssertionError(kind)

    return flow(f"fixture:{kind}", build)
