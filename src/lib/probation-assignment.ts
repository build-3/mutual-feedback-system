/**
 * Rules for assigning a sponsor and a buddy to someone on probation.
 *
 * Sponsor and buddy can each be any active teammate except the person
 * themselves. The sponsor owns the probation conversation; the buddy only helps
 * someone settle in. Pure, so the rules are tested without a database.
 */

export type AssignEmployee = {
  id: string
  name: string
  role: string
  is_active: boolean
}

export type AssignmentRequest = {
  employeeId: string
  /** undefined = leave as is, null = clear, string = set. */
  sponsorId?: string | null
  buddyId?: string | null
}

export type AssignmentCheck =
  | { ok: true; update: { sponsor_id?: string | null; buddy_id?: string | null } }
  | { ok: false; error: string; httpStatus: number }

export function validateAssignment({
  request,
  people,
  hasOpenProbation,
}: {
  request: AssignmentRequest
  people: Map<string, AssignEmployee>
  hasOpenProbation: boolean
}): AssignmentCheck {
  const person = people.get(request.employeeId)
  if (!person || !person.is_active) {
    return { ok: false, error: "That person is not on the active roster.", httpStatus: 404 }
  }
  if (!hasOpenProbation) {
    return {
      ok: false,
      error: "Sponsors and buddies are assigned to people on probation, and this person has no open probation.",
      httpStatus: 400,
    }
  }
  if (request.sponsorId === undefined && request.buddyId === undefined) {
    return { ok: false, error: "Nothing to change.", httpStatus: 400 }
  }

  const update: { sponsor_id?: string | null; buddy_id?: string | null } = {}

  if (request.sponsorId !== undefined) {
    if (request.sponsorId === null) {
      update.sponsor_id = null
    } else {
      const sponsor = people.get(request.sponsorId)
      if (!sponsor || !sponsor.is_active) {
        return { ok: false, error: "That sponsor is not on the active roster.", httpStatus: 400 }
      }
      if (sponsor.id === person.id) {
        return { ok: false, error: "Nobody can sponsor themselves.", httpStatus: 400 }
      }
      update.sponsor_id = sponsor.id
    }
  }

  if (request.buddyId !== undefined) {
    if (request.buddyId === null) {
      update.buddy_id = null
    } else {
      const buddy = people.get(request.buddyId)
      if (!buddy || !buddy.is_active) {
        return { ok: false, error: "That buddy is not on the active roster.", httpStatus: 400 }
      }
      if (buddy.id === person.id) {
        return { ok: false, error: "Nobody can be their own buddy.", httpStatus: 400 }
      }
      update.buddy_id = buddy.id
    }
  }

  return { ok: true, update }
}
