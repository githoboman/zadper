// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentPayRegistry {
    address public owner;
    address public recorder;

    event ReceiptRecorded(
        string indexed receiptId,
        string subject,
        uint256 amount,
        string evidenceNetwork,
        string timestamp
    );

    event DecisionRecorded(
        string indexed assessmentId,
        string verdict,
        string reason
    );

    event RecorderChanged(address indexed oldRecorder, address indexed newRecorder);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyRecorder() {
        require(msg.sender == recorder, "Only recorder");
        _;
    }

    constructor(address _recorder) {
        owner = msg.sender;
        recorder = _recorder;
    }

    function setRecorder(address _newRecorder) external onlyOwner {
        address old = recorder;
        recorder = _newRecorder;
        emit RecorderChanged(old, _newRecorder);
    }

    function recordPurchaseReceipt(
        string calldata receiptId,
        string calldata subject,
        uint256 amount,
        string calldata evidenceNetwork,
        string calldata timestamp
    ) external onlyRecorder {
        emit ReceiptRecorded(receiptId, subject, amount, evidenceNetwork, timestamp);
    }

    function recordDecisionWithRoot(
        string calldata assessmentId,
        string calldata verdict,
        string calldata reason
    ) external onlyRecorder {
        emit DecisionRecorded(assessmentId, verdict, reason);
    }
}
