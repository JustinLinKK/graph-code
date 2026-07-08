import helpers


class Greeter:
    def greet(self, name: str) -> str:
        return f"hello {helpers.normalize(name)}"


def run(name: str) -> str:
    greeter = Greeter()
    return greeter.greet(name)
