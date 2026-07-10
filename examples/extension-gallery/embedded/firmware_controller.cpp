#include <stdint.h>

struct SensorSample {
  uint16_t channel;
  uint16_t millivolts;
};

SensorSample sampleAdc(uint16_t channel) {
  SensorSample sample;
  sample.channel = channel;
  sample.millivolts = channel * 120;
  return sample;
}

bool shouldTriggerInterrupt(SensorSample sample) {
  return sample.millivolts > 1800;
}
