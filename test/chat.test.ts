import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAT_MAX, cleanChat, createRateLimit, splitLinks } from '../src/chat.ts'
import { parseMessage } from '../src/protocol.ts'

test('links are found, and the rest stays plain text', () => {
  assert.deepEqual(splitLinks('try https://example.com/v/123 tonight'), [
    { kind: 'text', text: 'try ' },
    { kind: 'link', text: 'https://example.com/v/123', href: 'https://example.com/v/123' },
    { kind: 'text', text: ' tonight' },
  ])
  assert.deepEqual(splitLinks('no links here'), [{ kind: 'text', text: 'no links here' }])
})

test('sentence punctuation after a link is not part of it', () => {
  const parts = splitLinks('here: https://example.com/a. and (https://example.com/b), ok?')
  assert.deepEqual(parts.filter(p => p.kind === 'link').map(p => p.text), ['https://example.com/a', 'https://example.com/b'])
  // A bracket that belongs to the link stays.
  assert.equal(splitLinks('https://en.wikipedia.org/wiki/Foo_(bar)')[0].text, 'https://en.wikipedia.org/wiki/Foo_(bar)')
})

test('only http and https become links', () => {
  assert.ok(splitLinks('javascript:alert(1) file:///c:/x ftp://x').every(p => p.kind === 'text'))
})

test('messages are trimmed, not empty, and capped', () => {
  assert.equal(cleanChat('  hi \r\n'), 'hi')
  assert.equal(cleanChat('   '), null)
  assert.equal(cleanChat('x'.repeat(CHAT_MAX + 50))?.length, CHAT_MAX)
})

test('sending is limited to a burst at a time', () => {
  const ok = createRateLimit(3, 1000)
  assert.deepEqual([ok(0), ok(10), ok(20), ok(30)], [true, true, true, false])
  assert.equal(ok(1100), true)
})

test('chat messages are checked on the way in', () => {
  assert.deepEqual(parseMessage({ t: 'chat', text: 'hey' }), { t: 'chat', text: 'hey' })
  assert.equal(parseMessage({ t: 'chat', text: '   ' }), null)
  assert.equal(parseMessage({ t: 'chat', text: 'x'.repeat(CHAT_MAX + 1) }), null)
  assert.equal(parseMessage({ t: 'chat', text: 42 }), null)
  assert.equal(parseMessage({ t: 'chat' }), null)
})
