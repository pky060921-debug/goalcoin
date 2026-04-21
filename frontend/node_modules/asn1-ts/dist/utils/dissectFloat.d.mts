export default function dissectFloat(value: number): {
    negative: boolean;
    exponent: number;
    mantissa: number;
};
