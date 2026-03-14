import { IsColorPipe } from './is-color.pipe';

describe('IsColorPipe', () => {
  it('create an instance', () => {
    const pipe = new IsColorPipe();
    expect(pipe).toBeTruthy();
  });
});
