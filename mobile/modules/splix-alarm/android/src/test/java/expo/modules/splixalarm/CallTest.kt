package expo.modules.splixalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reading a call out of a push, and deciding what to do with a ring. These
 * decide whether a phone rings at all, and whether an ordinary notification
 * is swallowed by mistake, so they are pinned here.
 *
 *   gradlew :splix-alarm:testDebugUnitTest      (from mobile/android)
 */
class CallTest {
  private val at = 1_800_000_000_000L
  private val tokyo = "aaaaaaaaaaaaaaaaaaaaaaaa"
  private val paris = "bbbbbbbbbbbbbbbbbbbbbbbb"

  private fun call(groupId: String = tokyo, sentAt: Long = at) =
    IncomingCall(groupId = groupId, groupName = "Tokyo Trip", callerName = "Asha", video = true, at = sentAt)

  // What Expo's push service hands the phone: the server's `data`, as text, under "body".
  private fun push(data: String) = mapOf("title" to "Tokyo Trip", "message" to "Asha started a group video call", "body" to data)

  private val ring =
    """{"type":"call","action":"ring","groupId":"$tokyo","groupName":"Tokyo Trip","callerId":"cccccccccccccccccccccccc","callerName":"Asha","video":true,"at":$at}"""

  private fun decide(
    incoming: IncomingCall = call(),
    now: Long = at + 1_000,
    seenAt: Long = 0,
    signedOut: Boolean = false,
    inCallGroupId: String? = null,
    ringing: IncomingCall? = null,
    phoneBusy: Boolean = false
  ) = CallRules.decide(incoming, now, seenAt, signedOut, inCallGroupId, ringing, phoneBusy)

  // ---- Reading the push ------------------------------------------------------

  @Test
  fun aRingPushIsReadAsTheCallItIsFor() {
    val signal = CallSignal.fromPush(push(ring))
    assertTrue(signal is CallSignal.Ring)
    val read = (signal as CallSignal.Ring).call
    assertEquals(tokyo, read.groupId)
    assertEquals("Tokyo Trip", read.groupName)
    assertEquals("Asha", read.callerName)
    assertEquals("cccccccccccccccccccccccc", read.callerId)
    assertEquals(true, read.video)
    assertEquals(at, read.at)
    assertEquals("Group video call", read.kind)
  }

  @Test
  fun aCallerTooOldToSayWhatKindOfCallLeavesItOpen() {
    val signal = CallSignal.fromJsonText(ring.replace("\"video\":true", "\"video\":null"))
    val read = (signal as CallSignal.Ring).call
    assertNull(read.video)
    assertEquals("Group call", read.kind)
  }

  @Test
  fun missingNamesDoNotBecomeTheWordNull() {
    val bare = """{"type":"call","action":"ring","groupId":"$tokyo","groupName":null,"callerName":null,"callerId":null,"at":$at}"""
    val read = (CallSignal.fromJsonText(bare) as CallSignal.Ring).call
    assertEquals("Group", read.groupName)
    assertEquals("Someone", read.callerName)
    assertNull(read.callerId)
  }

  @Test
  fun theEndOfACallIsRead() {
    val signal = CallSignal.fromJsonText("""{"type":"call","action":"end","groupId":"$tokyo","at":${at + 5}}""")
    assertEquals(CallSignal.End(tokyo, at + 5), signal)
  }

  @Test
  fun everyOtherPushIsLeftForTheNotificationsItBelongsTo() {
    // A reminder being synced, a chat notification, and one with no data at all.
    assertNull(CallSignal.fromPush(push("""{"type":"reminder-sync","action":"refresh"}""")))
    assertNull(CallSignal.fromPush(push("""{"type":"expense","groupId":"$tokyo"}""")))
    assertNull(CallSignal.fromPush(mapOf("title" to "Hello", "message" to "World")))
    assertNull(CallSignal.fromPush(push("not json")))
  }

  @Test
  fun aCallPushThisVersionCannotReadIsLeftToBeShownAsItIs() {
    // No group, no time, or an action invented later.
    assertNull(CallSignal.fromJsonText("""{"type":"call","action":"ring","at":$at}"""))
    assertNull(CallSignal.fromJsonText("""{"type":"call","action":"ring","groupId":"$tokyo"}"""))
    assertNull(CallSignal.fromJsonText("""{"type":"call","action":"hold","groupId":"$tokyo","at":$at}"""))
  }

  @Test
  fun aCallSurvivesBeingStoredAndReadBack() {
    val stored = call().copy(callerId = "cccccccccccccccccccccccc")
    assertEquals(stored, IncomingCall.fromJsonOrNull(stored.toJson().toString()))
    val unknownKind = call().copy(video = null)
    assertEquals(unknownKind, IncomingCall.fromJsonOrNull(unknownKind.toJson().toString()))
  }

  // ---- Deciding what to do with a ring ---------------------------------------

  @Test
  fun aNewRingRings() {
    assertEquals(RingAnswer.RING, decide())
  }

  @Test
  fun theSameRingArrivingTwiceRingsOnce() {
    // Once over the app's connection and once as a push.
    assertEquals(RingAnswer.IGNORE, decide(seenAt = at))
    // And one older than the last, arriving late.
    assertEquals(RingAnswer.IGNORE, decide(seenAt = at + 1))
    // The next call in the same group is a new ring.
    assertEquals(RingAnswer.RING, decide(seenAt = at - 60_000))
  }

  @Test
  fun nothingRingsWithNobodySignedIn() {
    assertEquals(RingAnswer.IGNORE, decide(signedOut = true))
  }

  @Test
  fun aCallThePersonIsAlreadyInDoesNotRing() {
    assertEquals(RingAnswer.IGNORE, decide(inCallGroupId = tokyo))
    assertEquals(RingAnswer.IGNORE, decide(ringing = call(sentAt = at - 20_000)))
  }

  @Test
  fun aCallWhileBusyWithAnotherIsAnnouncedWithoutRinging() {
    assertEquals(RingAnswer.WAITING, decide(inCallGroupId = paris))
    assertEquals(RingAnswer.WAITING, decide(ringing = call(groupId = paris)))
    assertEquals(RingAnswer.WAITING, decide(phoneBusy = true))
  }

  @Test
  fun aRingThatArrivesLongAfterItWasSentIsOnlyShownAsMissed() {
    assertEquals(RingAnswer.RING, decide(now = at + CallRules.STALE_MS))
    assertEquals(RingAnswer.MISSED, decide(now = at + CallRules.STALE_MS + 1))
    // A phone whose clock runs behind the server's still rings.
    assertEquals(RingAnswer.RING, decide(now = at - 90_000))
  }

  @Test
  fun theEndOfACallStopsOnlyTheRingItBelongsTo() {
    val ringing = call()
    assertTrue(CallRules.endsRing(ringing, tokyo, at + 3_000))
    assertTrue(CallRules.endsRing(ringing, tokyo, at))
    // The end of the call before this one, arriving late.
    assertFalse(CallRules.endsRing(ringing, tokyo, at - 1))
    assertFalse(CallRules.endsRing(ringing, paris, at + 3_000))
    assertFalse(CallRules.endsRing(null, tokyo, at + 3_000))
  }
}
