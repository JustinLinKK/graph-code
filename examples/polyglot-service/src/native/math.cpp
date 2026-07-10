#include "math.hpp"

int normalize(int value) {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

int weighted_score(int value, int weight) {
  return normalize(value * weight / 100);
}
