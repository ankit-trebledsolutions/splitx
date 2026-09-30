import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom padding for a sheet pinned to the bottom of a Modal.
 *
 * A Modal is its own window and draws edge-to-edge like the rest of the app,
 * so a sheet resting on the screen bottom sits under the system navigation bar
 * (48dp with Android's 3-button navigation) unless it pads itself. `base` is
 * the gap the design wants under the sheet's last row.
 *
 * Usage: style={[styles.sheet, { paddingBottom: useSheetBottom(spacing.lg) }]}
 */
const useSheetBottom = (base = 0) => useSafeAreaInsets().bottom + base;

export default useSheetBottom;
