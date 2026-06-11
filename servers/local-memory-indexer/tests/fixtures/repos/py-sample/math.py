def add(a, b):
    """Add two numbers."""
    result = a + b
    return result


def subtract(a, b):
    """Subtract b from a."""
    result = a - b
    return result


def multiply(a, b):
    """Multiply two numbers."""
    return a * b


class Calculator:
    """A simple calculator with chainable methods."""

    def __init__(self):
        self._value = 0

    def add(self, n):
        self._value += n
        return self

    def subtract(self, n):
        self._value -= n
        return self

    def multiply(self, n):
        self._value *= n
        return self

    def reset(self):
        self._value = 0
        return self

    def result(self):
        return self._value
