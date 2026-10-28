import { planFromPayment } from '../src/constants/pricing'
const cases: Array<[number | undefined, number, boolean, number | undefined]> = [
  [99, 79, true, 169], [99, 158, true, 229], [169, 79, true, 229], [229, 79, true, undefined],
  [99, 49, true, 99], [99, 1, true, 99], [undefined, 169, false, 169], [undefined, 79, false, undefined],
]
let f = 0
for (const [cur, paid, up, exp] of cases) {
  const got = planFromPayment(cur, paid, up)
  const ok = got === exp
  if (!ok) f++
  console.log(`${ok ? 'PASS' : 'FAIL'}  plan ${cur} + ₹${paid} ${up ? 'upgrade' : 'new pass'} -> ${got} (expected ${exp})`)
}
console.log(f ? `${f} failed` : 'all passed')
