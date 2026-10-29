package expo.modules.splixalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The time rules of an alarm: when it next rings, when it counts as overdue,
 * and whether two alarms are the same reminder at the same rhythm. These decide
 * whether a reminder rings at all, and they cannot be tried out on a phone
 * without waiting a week, so they are pinned here.
 *
 *   gradlew :splix-alarm:testDebugUnitTest      (from mobile/android)
 */
class AlarmTest {
  private val minute = 60_000L
  private val week = 7 * 24 * 60 * minute
  private val at = 1_800_000_000_000L

  private fun oneOff(fireAt: Long = at) = Alarm(id = "a", fireAt = fireAt, title = "Flight")
  private fun weekly(fireAt: Long = at, until: Long = 0) =
    Alarm(id = "a", fireAt = fireAt, title = "Check-in", repeatMs = week, repeatUntil = until)

  @Test
  fun aOneOffRingsAtItsTimeAndNeverAgain() {
    assertEquals(at, oneOff().nextAfter(at - 1))
    assertNull(oneOff().nextAfter(at))
    assertNull(oneOff().nextAfter(at + week))
  }

  @Test
  fun aWeeklyOneMovesToTheFirstTurnStillAhead() {
    assertEquals(at, weekly().nextAfter(at - minute))
    assertEquals(at + week, weekly().nextAfter(at))
    assertEquals(at + week, weekly().nextAfter(at + week - 1))
    // Found three weeks late: one ring at the next turn, not three to catch up.
    assertEquals(at + 4 * week, weekly().nextAfter(at + 3 * week + minute))
  }

  @Test
  fun aWeeklyOneStopsWhenTheTripEnds() {
    assertEquals(at + week, weekly(until = at + week).nextAfter(at))
    assertNull(weekly(until = at + week - 1).nextAfter(at))
  }

  @Test
  fun aRepeatTooShortToBeMeantIsTreatedAsNone() {
    val broken = Alarm(id = "a", fireAt = at, title = "x", repeatMs = 5)
    assertNull(broken.nextAfter(at + 1))
  }

  @Test
  fun overdueMeansDueButNotYetTooLateToRing() {
    assertFalse(oneOff().isOverdue(at - 1))
    assertTrue(oneOff().isOverdue(at))
    assertTrue(oneOff().isOverdue(at + Alarm.LATE_LIMIT_MS))
    assertFalse(oneOff().isOverdue(at + Alarm.LATE_LIMIT_MS + 1))
  }

  @Test
  fun theSameTimeIsTheSameSeriesAndAnEditedTimeIsNot() {
    assertTrue(oneOff().sameSeriesAs(oneOff()))
    assertFalse(oneOff().sameSeriesAs(oneOff(at + 5 * minute)))
  }

  @Test
  fun anotherTurnOfAWeeklyReminderIsTheSameSeries() {
    // What the phone is waiting for, against what the server sends: its first
    // date, or the date the server has already moved on to.
    assertTrue(weekly(at + 2 * week).sameSeriesAs(weekly(at)))
    assertTrue(weekly(at).sameSeriesAs(weekly(at + week)))
    // Moved to another hour by a person: a different alarm.
    assertFalse(weekly(at).sameSeriesAs(weekly(at + week + 60 * minute)))
  }
}
