import { decodeCursor, encodeCursor } from './cursor';

describe('keyset cursor', () => {
  it('round-trips a cursor', () => {
    const c = { sortScore: 87, id: 12345 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('round-trips the unscored sentinel (-1)', () => {
    const c = { sortScore: -1, id: 7 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it.each([
    ['garbage', 'not-a-cursor!!'],
    ['score above 100', Buffer.from('101:5').toString('base64url')],
    ['zero id', Buffer.from('50:0').toString('base64url')],
    ['sql injection attempt', Buffer.from("50:1; DROP TABLE jobs").toString('base64url')],
    ['empty', ''],
  ])('rejects %s', (_label, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
});
