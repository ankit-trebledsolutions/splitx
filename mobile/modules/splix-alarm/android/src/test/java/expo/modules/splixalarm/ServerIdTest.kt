package expo.modules.splixalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The app's launch screen takes "open this alarm" and "open this call" from
 * any app on the phone, and the ids in them end up in API paths. Only server
 * ids (24 lowercase hex characters) may get through; these pin that.
 *
 *   gradlew :splix-alarm:testDebugUnitTest      (from mobile/android)
 */
class ServerIdTest {
  private val at = 1_800_000_000_000L
  private val reminder = "aaaaaaaaaaaaaaaaaaaaaaaa"
  private val tokyo = "bbbbbbbbbbbbbbbbbbbbbbbb"
  private val task = "cccccccccccccccccccccccc"

  // What another app could put in the intent instead of what we put there.
  private val forged = listOf(
    "../../admin/users",
    "aaaaaaaaaaaaaaaaaaaaaaa",
    "aaaaaaaaaaaaaaaaaaaaaaaaa",
    "AAAAAAAAAAAAAAAAAAAAAAAA",
    "aaaaaaaaaaaaaaaaaaaaaaa/",
    "aaaaaaaaaaaaaaaaaaaaaaaa\n",
    "",
  )

  private fun alarmJson(id: String = reminder, groupId: String? = tokyo, taskId: String? = task): String =
    Alarm(id = id, fireAt = at, title = "Flight", groupId = groupId, taskId = taskId).toJson().toString()

  @Test
  fun onlyTwentyFourLowercaseHexCharactersAreAServerId() {
    assertTrue(ServerId.isValid(reminder))
    assertTrue(ServerId.isValid("0123456789abcdef01234567"))
    for (value in forged) assertFalse(value, ServerId.isValid(value))
    assertFalse(ServerId.isValid(null))
    assertTrue(ServerId.isValidOrAbsent(null))
  }

  @Test
  fun anAlarmOfOursIsReadBack() {
    val read = Alarm.fromJsonOrNull(alarmJson())
    assertNotNull(read)
    assertEquals(task, read!!.taskId)
    // A personal reminder has no group or task.
    assertNotNull(Alarm.fromJsonOrNull(alarmJson(groupId = null, taskId = null)))
  }

  @Test
  fun anAlarmCarryingAnyOtherIdIsRefusedWhole() {
    for (value in forged) {
      assertNull(value, Alarm.fromJsonOrNull(alarmJson(id = value)))
      // An empty group or task is how "none" is stored, so it reads as none.
      if (value.isEmpty()) continue
      assertNull(value, Alarm.fromJsonOrNull(alarmJson(groupId = value)))
      assertNull(value, Alarm.fromJsonOrNull(alarmJson(taskId = value)))
    }
    assertNull(Alarm.fromJsonOrNull(alarmJson(groupId = "")).let { it?.groupId })
  }

  @Test
  fun anAlarmFromJavaScriptIsCheckedTheSameWay() {
    val good = mapOf<String, Any?>("id" to reminder, "fireAt" to at.toDouble(), "title" to "Flight", "taskId" to task)
    assertEquals(task, Alarm.fromMap(good).taskId)
    val bad = good + ("taskId" to "../../admin")
    assertTrue(runCatching { Alarm.fromMap(bad) }.isFailure)
  }

  @Test
  fun aCallForAGroupThatIsNotAServerIdIsNoCall() {
    for (value in forged) {
      val json = """{"groupId":${org.json.JSONObject.quote(value)},"groupName":"Tokyo","callerName":"Asha","at":$at}"""
      assertNull(value, IncomingCall.fromJsonOrNull(json))
      assertNull(value, IncomingCall.fromMap(mapOf("groupId" to value, "at" to at.toDouble())))
      val end = """{"type":"call","action":"end","groupId":${org.json.JSONObject.quote(value)},"at":$at}"""
      assertNull(value, CallSignal.fromJsonText(end))
    }
  }

  @Test
  fun aCallerIdThatIsNotAServerIdIsLeftOut() {
    val json = """{"groupId":"$tokyo","groupName":"Tokyo","callerName":"Asha","callerId":"../me","at":$at}"""
    val call = IncomingCall.fromJsonOrNull(json)
    assertNotNull(call)
    assertNull(call!!.callerId)
  }
}
