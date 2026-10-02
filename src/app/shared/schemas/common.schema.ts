import { Timestamp } from 'firebase/firestore';
import * as v from 'valibot';

export const timestampToDate = v.pipe(
  v.instance(Timestamp),
  v.transform((ts) => ts.toDate()),
);
export const EMAIL_REQUIRED_MSG = 'Email is required';
export const emailError = 'Please enter a valid email address';
export const emailSchema = v.optional(
  v.pipe(v.string(), v.trim(), v.nonEmpty(EMAIL_REQUIRED_MSG), v.email(emailError)),
  '',
);

export const minLengthMsg = (min: number) => `Minimum length is ${min} characters`;
export const maxLengthMsg = (max: number) => `Maximum length is ${max} characters`;
export const requiredString = (errMsg: string, min = 3, max = 15) =>
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(errMsg),
      v.minLength(min, minLengthMsg(min)),
      v.maxLength(max, maxLengthMsg(max)),
    ),
    '',
  );
export const phoneSchema = v.optional(
  v.pipe(
    v.string('Phone number must be a string.'),
    v.trim(),
    v.nonEmpty('Phone number is required'),
    v.regex(/^[+]?[0-9\s\-()]+$/, 'Please enter a valid phone number'),
    v.minLength(8, minLengthMsg(8)),
    v.maxLength(20, maxLengthMsg(20)),
  ),
  '',
);

export const futureDateSchema = v.nonNullish(
  v.pipe(
    v.date('Invalid date format'),
    v.check((val) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inputDate = new Date(val);
      inputDate.setHours(0, 0, 0, 0);
      return inputDate >= today;
    }, 'Date cannot be in the past'),
  ),
  'Please select a preferred date',
);

export const PASSWORD_REQUIRED_MSG = 'Password is required';
export const MIN_LEN_PASS = 8;
export const passwordSchema = v.optional(
  v.pipe(
    v.string(),
    v.nonEmpty(PASSWORD_REQUIRED_MSG),
    v.minLength(MIN_LEN_PASS, minLengthMsg(MIN_LEN_PASS)),
  ),
  '',
);
