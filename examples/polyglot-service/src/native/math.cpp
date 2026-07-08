#include "math.hpp"

int normalize(int value) {
  if (value < 0) {
    return -value;
  }
  return value;
}
