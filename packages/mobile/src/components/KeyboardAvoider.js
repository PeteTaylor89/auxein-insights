// components/KeyboardAvoider.js — single source of truth for keyboard handling.
//
// The app runs Android edge-to-edge (app.json android.edgeToEdgeEnabled), which
// stops the window from auto-resizing when the soft keyboard opens — content
// (and any bottom-pinned action bar) slides UNDER the keypad. iOS never resizes
// on its own either. So every form screen wraps its scroll area + pinned action
// bar in this, which lifts the whole stack above the keyboard:
//   iOS     → behavior="padding" (pads the bottom by the keyboard height)
//   Android → behavior="height"  (shrinks the avoiding view by the keyboard height)
//
// Put the ScrollView (flex:1) and the bottom bar BOTH inside this so the bar
// rides up with the keyboard and stays tappable.
import { KeyboardAvoidingView, Platform } from 'react-native';

export default function KeyboardAvoider({ style, offset = 0, children, ...rest }) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
