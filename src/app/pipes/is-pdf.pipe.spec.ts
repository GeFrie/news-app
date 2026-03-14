import { IsPdfPipe } from './is-pdf.pipe';

describe('IsPdfPipe', () => {
  it('create an instance', () => {
    const pipe = new IsPdfPipe();
    expect(pipe).toBeTruthy();
  });
});
