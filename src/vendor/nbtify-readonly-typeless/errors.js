// @ts-nocheck
class NBTError extends Error {
    constructor(message) {
        super(message);
        this.name = new.target.name;
    }
}
export class UnexpectedEndTagError extends NBTError {
}
;
export class InvalidTagError extends NBTError {
}
;
export class VarNumTooLargeError extends NBTError {
}
;
export class UnexpectedBufferEndError extends NBTError {
}
;
export class InvalidOpeningTagError extends NBTError {
}
;
export class UnexpectedRootNameError extends NBTError {
}
;
//# sourceMappingURL=errors.js.map