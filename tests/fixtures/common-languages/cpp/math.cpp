#include "math.hpp"

int Calculator::add(int left, int right) {
  return left + right;
}

int total() {
  Calculator calculator;
  return calculator.add(1, 2);
}
