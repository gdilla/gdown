pub mod ai_files;
pub mod export;
pub mod fs;
pub mod session;

use std::sync::{Condvar, Mutex};

/// Count of background writes and exports in progress, so exit can wait for them.
static IN_FLIGHT_IO: (Mutex<usize>, Condvar) = (Mutex::new(0), Condvar::new());

/// Held for the duration of one write or export. Commands run off the main
/// thread, so without this an approved exit could cut a write or Pandoc run off
/// midway (leaving a partial export or a stray temp file).
pub(crate) struct InFlightIo;

impl InFlightIo {
    pub(crate) fn begin() -> Self {
        *IN_FLIGHT_IO.0.lock().unwrap_or_else(|e| e.into_inner()) += 1;
        Self
    }
}

impl Drop for InFlightIo {
    fn drop(&mut self) {
        let mut count = IN_FLIGHT_IO.0.lock().unwrap_or_else(|e| e.into_inner());
        *count -= 1;
        if *count == 0 {
            IN_FLIGHT_IO.1.notify_all();
        }
    }
}

/// Block until no write or export is in flight.
pub(crate) fn wait_for_in_flight_io() {
    let mut count = IN_FLIGHT_IO.0.lock().unwrap_or_else(|e| e.into_inner());
    while *count > 0 {
        count = IN_FLIGHT_IO
            .1
            .wait(count)
            .unwrap_or_else(|e| e.into_inner());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn test_exit_wait_holds_until_in_flight_io_finishes() {
        let export = InFlightIo::begin();
        let (done_tx, done_rx) = mpsc::channel();
        std::thread::spawn(move || {
            wait_for_in_flight_io();
            done_tx.send(()).unwrap();
        });

        assert!(
            done_rx.recv_timeout(Duration::from_millis(200)).is_err(),
            "exit must not proceed while an export is running"
        );
        drop(export);
        done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("exit proceeds once the export settles");
    }
}
