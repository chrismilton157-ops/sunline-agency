'use client';
import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitEnquiry, type EnquiryState } from '@/app/enquiry/actions';

const initial: EnquiryState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Book a call to see if you qualify →'}
    </button>
  );
}

export function EnquiryForm() {
  const [state, action] = useFormState(submitEnquiry, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state.status]);

  if (state.status === 'success') {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-good/20 mb-4">
          <svg className="w-7 h-7 text-good" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-ink mb-2">We&apos;ll be in touch shortly.</h3>
        <p className="text-muted text-sm max-w-sm mx-auto">
          Thanks for reaching out. We review every enquiry personally and will
          contact you within one working day to arrange a call.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label block mb-1" htmlFor="eq-name">Your name <span className="text-bad">*</span></label>
          <input id="eq-name" name="name" type="text" required autoComplete="name"
            className="input w-full" placeholder="Jane Smith" />
        </div>
        <div>
          <label className="label block mb-1" htmlFor="eq-company">Company name <span className="text-bad">*</span></label>
          <input id="eq-company" name="company" type="text" required
            className="input w-full" placeholder="Apex Solar Ltd" />
        </div>
        <div>
          <label className="label block mb-1" htmlFor="eq-email">Email <span className="text-bad">*</span></label>
          <input id="eq-email" name="email" type="email" required autoComplete="email"
            className="input w-full" placeholder="jane@apexsolar.co.uk" />
        </div>
        <div>
          <label className="label block mb-1" htmlFor="eq-phone">Phone <span className="text-bad">*</span></label>
          <input id="eq-phone" name="phone" type="tel" required autoComplete="tel"
            className="input w-full" placeholder="07700 900000" />
        </div>
      </div>
      <div>
        <label className="label block mb-1" htmlFor="eq-region">Regions / postcodes you cover <span className="text-bad">*</span></label>
        <input id="eq-region" name="region" type="text" required
          className="input w-full" placeholder="e.g. South West — BA, BS, TA, EX" />
      </div>
      <div>
        <label className="label block mb-1" htmlFor="eq-spend">
          Rough current monthly spend on leads / appointments <span className="text-muted">(optional)</span>
        </label>
        <select id="eq-spend" name="current_lead_spend" className="input w-full bg-white">
          <option value="">Prefer not to say</option>
          <option value="Under £500/mo">Under £500/mo</option>
          <option value="£500–£2,000/mo">£500–£2,000/mo</option>
          <option value="£2,000–£5,000/mo">£2,000–£5,000/mo</option>
          <option value="£5,000+/mo">£5,000+/mo</option>
        </select>
      </div>

      {state.status === 'error' && (
        <p className="text-bad text-sm">{state.message}</p>
      )}

      <SubmitButton />
      <p className="text-xs text-muted text-center">
        We review every enquiry personally. No spam, no pressure — just a straight conversation.
      </p>
    </form>
  );
}
