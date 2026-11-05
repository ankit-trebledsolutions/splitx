package expo.modules.splixalarm

/**
 * The ids the server hands out (MongoDB ObjectIds): 24 lowercase hex characters.
 *
 * The app's launch screen is open to every other app on the phone, and what it
 * is handed as "open this alarm" or "open this call" becomes a screen's params
 * in JavaScript, and from there part of an API path. So every id read from an
 * intent, a push, the phone's storage or JavaScript is checked here first.
 */
internal object ServerId {
  private val PATTERN = Regex("[a-f0-9]{24}")

  fun isValid(value: String?): Boolean = value != null && PATTERN.matches(value)

  /** Absent is fine; present, it must be a server id. */
  fun isValidOrAbsent(value: String?): Boolean = value == null || isValid(value)
}
