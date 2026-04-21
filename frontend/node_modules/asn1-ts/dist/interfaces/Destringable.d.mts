export default interface Destringable<T> {
    fromString(str: string): T;
}
