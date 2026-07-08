pub struct Counter {
  value: i32,
}

impl Counter {
  pub fn next(&mut self) -> i32 {
    self.value += 1;
    self.value
  }
}

pub fn make_counter() -> Counter {
  Counter { value: 0 }
}
