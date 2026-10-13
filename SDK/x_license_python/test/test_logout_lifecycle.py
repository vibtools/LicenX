import signal
import unittest
from unittest.mock import Mock, patch

from x_license_python.device import DeviceManager
from x_license_python.logout import LogoutManager


class LogoutLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.communicator = Mock()
        self.storage = Mock()

    @staticmethod
    def _registered_signal_handlers(signal_set):
        return {
            call.args[0]: call.args[1]
            for call in signal_set.call_args_list
        }

    def test_previous_handlers_run_and_exit_cleanup_runs_once(self):
        previous_handlers = {
            signal.SIGINT: Mock(),
            signal.SIGTERM: Mock(),
        }
        with patch(
            "x_license_python.logout.signal.getsignal",
            side_effect=previous_handlers.get,
        ), patch("x_license_python.logout.signal.signal") as signal_set, patch(
            "x_license_python.logout.atexit.register"
        ) as register_exit, patch.object(
            DeviceManager, "get_hwid", return_value="test-hwid"
        ):
            manager = LogoutManager(self.communicator, self.storage)
            manager.set_active_session("test-license")
            handlers = self._registered_signal_handlers(signal_set)
            frame = object()

            handlers[signal.SIGINT](signal.SIGINT, frame)
            handlers[signal.SIGTERM](signal.SIGTERM, frame)
            register_exit.call_args.args[0]()

        previous_handlers[signal.SIGINT].assert_called_once_with(signal.SIGINT, frame)
        previous_handlers[signal.SIGTERM].assert_called_once_with(signal.SIGTERM, frame)
        self.communicator.send_logout.assert_called_once_with(
            "test-license", "test-hwid"
        )

    def test_default_and_ignored_handlers_keep_their_signal_semantics(self):
        previous_handlers = {
            signal.SIGINT: signal.SIG_DFL,
            signal.SIGTERM: signal.SIG_IGN,
        }
        with patch(
            "x_license_python.logout.signal.getsignal",
            side_effect=previous_handlers.get,
        ), patch("x_license_python.logout.signal.signal") as signal_set, patch(
            "x_license_python.logout.atexit.register"
        ), patch("x_license_python.logout.os.getpid", return_value=123), patch(
            "x_license_python.logout.os.kill"
        ) as kill_signal, patch.object(
            DeviceManager, "get_hwid", return_value="test-hwid"
        ):
            manager = LogoutManager(self.communicator, self.storage)
            manager.set_active_session("test-license")
            handlers = self._registered_signal_handlers(signal_set)

            handlers[signal.SIGTERM](signal.SIGTERM, None)
            self.communicator.send_logout.assert_not_called()
            handlers[signal.SIGINT](signal.SIGINT, None)

        signal_set.assert_any_call(signal.SIGINT, signal.SIG_DFL)
        kill_signal.assert_called_once_with(123, signal.SIGINT)
        self.communicator.send_logout.assert_called_once_with(
            "test-license", "test-hwid"
        )

    def test_disabling_exit_hooks_does_not_change_host_signal_handlers(self):
        with patch("x_license_python.logout.signal.getsignal") as get_signal, patch(
            "x_license_python.logout.signal.signal"
        ) as set_signal, patch("x_license_python.logout.atexit.register") as register_exit:
            LogoutManager(self.communicator, self.storage, auto_logout_on_exit=False)

        get_signal.assert_not_called()
        set_signal.assert_not_called()
        register_exit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
