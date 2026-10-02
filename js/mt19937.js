/* mt19937.js —— CPython random.Random 的等价实现（init_by_array + genrand_res53）。
   项目里所有随机种子都是 Python 的 random.Random(n)；要逐帧复现就必须用同一套 MT19937。 */
(function () {
  'use strict';
  var PV = window.PV;
  var N = 624, M = 397, MATRIX_A = 0x9908b0df, UPPER = 0x80000000, LOWER = 0x7fffffff;
  function MT(seed) { this.mt = new Uint32Array(N); this.mti = N + 1; this.seed(seed); }
  MT.prototype.initGenrand = function (s) {
    var mt = this.mt; mt[0] = s >>> 0;
    for (var i = 1; i < N; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
    this.mti = N;
  };
  MT.prototype.initByArray = function (key) {
    var mt = this.mt, i = 1, j = 0, k;
    this.initGenrand(19650218);
    k = Math.max(N, key.length);
    for (; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = UPPER;
  };
  MT.prototype.seed = function (s) {
    s = Math.abs(Math.trunc(s));
    var key = [], v = s;
    if (v === 0) key = [0];
    else { while (v > 0) { key.push(v >>> 0); v = Math.floor(v / 4294967296); } }
    this.initByArray(key);
  };
  MT.prototype.genrand = function () {
    var mt = this.mt, y, kk;
    if (this.mti >= N) {
      for (kk = 0; kk < N - M; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
      }
      y = (mt[N - 1] & UPPER) | (mt[0] & LOWER);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
      this.mti = 0;
    }
    y = mt[this.mti++];
    y ^= (y >>> 11);
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= (y >>> 18);
    return y >>> 0;
  };
  MT.prototype.random = function () {
    var a = this.genrand() >>> 5, b = this.genrand() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  };
  MT.prototype.next = function () { return this.random(); };
  /* CPython 的 getrandbits(k)：k<=32 时取一个 32 位字的高 k 位 */
  MT.prototype.getrandbits = function (k) {
    if (k <= 0) return 0;
    if (k <= 32) return (this.genrand() >>> (32 - k)) >>> 0;
    var words = Math.ceil(k / 32), out = 0, i;
    for (i = 0; i < words; i++) out += this.genrand() * Math.pow(2, 32 * i);   /* 小端：word i 占 32i 位起 */
    return out % Math.pow(2, k);
  };
  /* CPython 的 _randbelow_with_getrandbits：拒绝采样，choice/randrange 都走它 */
  MT.prototype._randbelow = function (n) {
    if (!n) return 0;
    var k = 0, m = n;
    while (m > 0) { k++; m >>>= 1; }
    var r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  };
  MT.prototype.randrange = function (n) { return this._randbelow(n); };
  MT.prototype.choice = function (seq) { return seq[this._randbelow(seq.length)]; };
  MT.prototype.gauss = function (mu, sigma) {
    mu = mu || 0; sigma = sigma === undefined ? 1 : sigma;
    var u1 = Math.max(1e-12, this.random()), u2 = this.random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  PV.MT = MT;
  PV.mt = function (seed) { return new MT(seed); };
})();
