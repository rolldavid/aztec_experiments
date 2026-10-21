export default {
  "artifact_version": 1,
  "noir_version": "1.0.0-rc.3+5a7ee9bf5ed8973076df7bb0d2b723024db09ae7",
  "hash": "9003830117014485222",
  "abi": {
    "abi_version": 1,
    "parameters": [
      {
        "name": "tx_request",
        "type": {
          "kind": "struct",
          "path": "types::abis::transaction::tx_request::TxRequest",
          "fields": [
            {
              "name": "origin",
              "type": {
                "kind": "struct",
                "path": "types::address::aztec_address::AztecAddress",
                "fields": [
                  {
                    "name": "inner",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "args_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "tx_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::transaction::tx_context::TxContext",
                "fields": [
                  {
                    "name": "chain_id",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "version",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "gas_settings",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::gas_settings::GasSettings",
                      "fields": [
                        {
                          "name": "gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "teardown_gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_priority_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            },
            {
              "name": "function_data",
              "type": {
                "kind": "struct",
                "path": "types::abis::function_data::FunctionData",
                "fields": [
                  {
                    "name": "selector",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::function_selector::FunctionSelector",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_private",
                    "type": {
                      "kind": "boolean"
                    }
                  }
                ]
              }
            },
            {
              "name": "salt",
              "type": {
                "kind": "field"
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "vk_tree_root",
        "type": {
          "kind": "field"
        },
        "visibility": "private"
      },
      {
        "name": "protocol_contracts",
        "type": {
          "kind": "struct",
          "path": "types::abis::protocol_contracts::ProtocolContracts",
          "fields": [
            {
              "name": "derived_addresses",
              "type": {
                "kind": "array",
                "length": 11,
                "type": {
                  "kind": "struct",
                  "path": "types::address::aztec_address::AztecAddress",
                  "fields": [
                    {
                      "name": "inner",
                      "type": {
                        "kind": "field"
                      }
                    }
                  ]
                }
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "private_call",
        "type": {
          "kind": "struct",
          "path": "types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs",
          "fields": [
            {
              "name": "vk",
              "type": {
                "kind": "struct",
                "path": "types::proof::verification_key::VerificationKey",
                "fields": [
                  {
                    "name": "key",
                    "type": {
                      "kind": "array",
                      "length": 151,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "verification_key_hints",
              "type": {
                "kind": "struct",
                "path": "types::abis::private_kernel::private_call_data::PrivateVerificationKeyHints",
                "fields": [
                  {
                    "name": "salted_initialization_hash",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::salted_initialization_hash::SaltedInitializationHash",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "public_keys",
                    "type": {
                      "kind": "struct",
                      "path": "types::public_keys::PublicKeys",
                      "fields": [
                        {
                          "name": "npk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "ivpk_m",
                          "type": {
                            "kind": "struct",
                            "path": "types::public_keys::IvpkM",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "std::embedded_curve_ops::EmbeddedCurvePoint",
                                  "fields": [
                                    {
                                      "name": "x",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "y",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "ovpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "tpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "mspk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "fbpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_class_artifact_hash",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "contract_class_public_bytecode_commitment",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "function_leaf_membership_witness",
                    "type": {
                      "kind": "struct",
                      "path": "types::merkle_tree::membership::MembershipWitness",
                      "fields": [
                        {
                          "name": "leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "sibling_path",
                          "type": {
                            "kind": "array",
                            "length": 7,
                            "type": {
                              "kind": "field"
                            }
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_witness",
                    "type": {
                      "kind": "struct",
                      "path": "types::merkle_tree::membership::MembershipWitness",
                      "fields": [
                        {
                          "name": "leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "sibling_path",
                          "type": {
                            "kind": "array",
                            "length": 40,
                            "type": {
                              "kind": "field"
                            }
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_leaf",
                    "type": {
                      "kind": "struct",
                      "path": "types::data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage",
                      "fields": [
                        {
                          "name": "slot",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "value",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_slot",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_index",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_delayed_public_mutable_values",
                    "type": {
                      "kind": "array",
                      "length": 3,
                      "type": {
                        "kind": "field"
                      }
                    }
                  }
                ]
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "app_public_inputs",
        "type": {
          "kind": "struct",
          "path": "types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs",
          "fields": [
            {
              "name": "call_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::call_context::CallContext",
                "fields": [
                  {
                    "name": "msg_sender",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_address",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "function_selector",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::function_selector::FunctionSelector",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_static_call",
                    "type": {
                      "kind": "boolean"
                    }
                  }
                ]
              }
            },
            {
              "name": "args_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "returns_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "anchor_block_header",
              "type": {
                "kind": "struct",
                "path": "types::abis::block_header::BlockHeader",
                "fields": [
                  {
                    "name": "last_archive",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                      "fields": [
                        {
                          "name": "root",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_available_leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "state",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::state_reference::StateReference",
                      "fields": [
                        {
                          "name": "l1_to_l2_message_tree",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                            "fields": [
                              {
                                "name": "root",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "next_available_leaf_index",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "partial",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::partial_state_reference::PartialStateReference",
                            "fields": [
                              {
                                "name": "note_hash_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "nullifier_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "public_data_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "sponge_blob_hash",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "tx_effects_tree_root",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "global_variables",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::global_variables::GlobalVariables",
                      "fields": [
                        {
                          "name": "chain_id",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "version",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "block_number",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        },
                        {
                          "name": "slot_number",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "timestamp",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 64
                          }
                        },
                        {
                          "name": "coinbase",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::eth_address::EthAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "fee_recipient",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "gas_fees",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "total_fees",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "total_mana_used",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "tx_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::transaction::tx_context::TxContext",
                "fields": [
                  {
                    "name": "chain_id",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "version",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "gas_settings",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::gas_settings::GasSettings",
                      "fields": [
                        {
                          "name": "gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "teardown_gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_priority_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            },
            {
              "name": "min_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "is_fee_payer",
              "type": {
                "kind": "boolean"
              }
            },
            {
              "name": "expiration_timestamp",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 64
              }
            },
            {
              "name": "start_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "end_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "expected_non_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "expected_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "note_hash_read_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::side_effect::counted::Counted",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "nullifier_read_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::side_effect::counted::Counted",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "key_validation_requests_and_separators",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::validation_requests::key_validation_request_and_separator::KeyValidationRequestAndSeparator",
                        "fields": [
                          {
                            "name": "request",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::validation_requests::key_validation_request::KeyValidationRequest",
                              "fields": [
                                {
                                  "name": "pk_m_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "sk_app",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "key_type_domain_separator",
                            "type": {
                              "kind": "field"
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "private_call_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::private_call_request::PrivateCallRequest",
                        "fields": [
                          {
                            "name": "call_context",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::call_context::CallContext",
                              "fields": [
                                {
                                  "name": "msg_sender",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "contract_address",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "function_selector",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::abis::function_selector::FunctionSelector",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "integer",
                                          "sign": "unsigned",
                                          "width": 32
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "is_static_call",
                                  "type": {
                                    "kind": "boolean"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "args_hash",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "returns_hash",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "start_side_effect_counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          },
                          {
                            "name": "end_side_effect_counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "public_call_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 32,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::public_call_request::PublicCallRequest",
                              "fields": [
                                {
                                  "name": "msg_sender",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "contract_address",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "is_static_call",
                                  "type": {
                                    "kind": "boolean"
                                  }
                                },
                                {
                                  "name": "calldata_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "public_teardown_call_request",
              "type": {
                "kind": "struct",
                "path": "types::abis::public_call_request::PublicCallRequest",
                "fields": [
                  {
                    "name": "msg_sender",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_address",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_static_call",
                    "type": {
                      "kind": "boolean"
                    }
                  },
                  {
                    "name": "calldata_hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "note_hashes",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "nullifiers",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::nullifier::Nullifier",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "note_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "l2_to_l1_msgs",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                              "fields": [
                                {
                                  "name": "recipient",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::eth_address::EthAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "content",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "private_logs",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::private_log::PrivateLogData",
                              "fields": [
                                {
                                  "name": "log",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::abis::log::Log",
                                    "fields": [
                                      {
                                        "name": "fields",
                                        "type": {
                                          "kind": "array",
                                          "length": 16,
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      },
                                      {
                                        "name": "length",
                                        "type": {
                                          "kind": "integer",
                                          "sign": "unsigned",
                                          "width": 32
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "note_hash_counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "contract_class_logs_hashes",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 1,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::log_hash::LogHash",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "length",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "protocol_nullifier",
              "type": {
                "kind": "field"
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "is_private_only",
        "type": {
          "kind": "boolean"
        },
        "visibility": "private"
      },
      {
        "name": "revertible_counter_hint",
        "type": {
          "kind": "integer",
          "sign": "unsigned",
          "width": 32
        },
        "visibility": "private"
      }
    ],
    "return_type": {
      "abi_type": {
        "kind": "struct",
        "path": "types::abis::kernel_circuit_public_inputs::private_kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs",
        "fields": [
          {
            "name": "constants",
            "type": {
              "kind": "struct",
              "path": "types::abis::private_tx_constant_data::PrivateTxConstantData",
              "fields": [
                {
                  "name": "anchor_block_header",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::block_header::BlockHeader",
                    "fields": [
                      {
                        "name": "last_archive",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                          "fields": [
                            {
                              "name": "root",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "next_available_leaf_index",
                              "type": {
                                "kind": "field"
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "state",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::state_reference::StateReference",
                          "fields": [
                            {
                              "name": "l1_to_l2_message_tree",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                "fields": [
                                  {
                                    "name": "root",
                                    "type": {
                                      "kind": "field"
                                    }
                                  },
                                  {
                                    "name": "next_available_leaf_index",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "partial",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::partial_state_reference::PartialStateReference",
                                "fields": [
                                  {
                                    "name": "note_hash_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "nullifier_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "public_data_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "sponge_blob_hash",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "tx_effects_tree_root",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "global_variables",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::global_variables::GlobalVariables",
                          "fields": [
                            {
                              "name": "chain_id",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "version",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "block_number",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 32
                              }
                            },
                            {
                              "name": "slot_number",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "timestamp",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 64
                              }
                            },
                            {
                              "name": "coinbase",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::eth_address::EthAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "fee_recipient",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::aztec_address::AztecAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "gas_fees",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "total_fees",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "total_mana_used",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "tx_context",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::transaction::tx_context::TxContext",
                    "fields": [
                      {
                        "name": "chain_id",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "version",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "gas_settings",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::gas_settings::GasSettings",
                          "fields": [
                            {
                              "name": "gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "teardown_gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_priority_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "protocol_nullifier",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "vk_tree_root",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "protocol_contracts",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::protocol_contracts::ProtocolContracts",
                    "fields": [
                      {
                        "name": "derived_addresses",
                        "type": {
                          "kind": "array",
                          "length": 11,
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "min_revertible_side_effect_counter",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 32
            }
          },
          {
            "name": "validation_requests",
            "type": {
              "kind": "struct",
              "path": "types::abis::validation_requests::private_validation_requests::PrivateValidationRequests",
              "fields": [
                {
                  "name": "note_hash_read_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "nullifier_read_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "scoped_key_validation_requests_and_separators",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::validation_requests::key_validation_request_and_separator::KeyValidationRequestAndSeparator",
                                  "fields": [
                                    {
                                      "name": "request",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::validation_requests::key_validation_request::KeyValidationRequest",
                                        "fields": [
                                          {
                                            "name": "pk_m_hash",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "sk_app",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "key_type_domain_separator",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "end",
            "type": {
              "kind": "struct",
              "path": "types::abis::accumulated_data::private_accumulated_data::PrivateAccumulatedData",
              "fields": [
                {
                  "name": "note_hashes",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "nullifiers",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::nullifier::Nullifier",
                                        "fields": [
                                          {
                                            "name": "value",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "note_hash",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "l2_to_l1_msgs",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 8,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                                        "fields": [
                                          {
                                            "name": "recipient",
                                            "type": {
                                              "kind": "struct",
                                              "path": "types::address::eth_address::EthAddress",
                                              "fields": [
                                                {
                                                  "name": "inner",
                                                  "type": {
                                                    "kind": "field"
                                                  }
                                                }
                                              ]
                                            }
                                          },
                                          {
                                            "name": "content",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "private_logs",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::private_log::PrivateLogData",
                                        "fields": [
                                          {
                                            "name": "log",
                                            "type": {
                                              "kind": "struct",
                                              "path": "types::abis::log::Log",
                                              "fields": [
                                                {
                                                  "name": "fields",
                                                  "type": {
                                                    "kind": "array",
                                                    "length": 16,
                                                    "type": {
                                                      "kind": "field"
                                                    }
                                                  }
                                                },
                                                {
                                                  "name": "length",
                                                  "type": {
                                                    "kind": "integer",
                                                    "sign": "unsigned",
                                                    "width": 32
                                                  }
                                                }
                                              ]
                                            }
                                          },
                                          {
                                            "name": "note_hash_counter",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "contract_class_logs_hashes",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 1,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::log_hash::LogHash",
                                        "fields": [
                                          {
                                            "name": "value",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "length",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "public_call_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 32,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::counted::Counted",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::public_call_request::PublicCallRequest",
                                  "fields": [
                                    {
                                      "name": "msg_sender",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "contract_address",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "is_static_call",
                                      "type": {
                                        "kind": "boolean"
                                      }
                                    },
                                    {
                                      "name": "calldata_hash",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "private_call_stack",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 16,
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::private_call_request::PrivateCallRequest",
                            "fields": [
                              {
                                "name": "call_context",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::call_context::CallContext",
                                  "fields": [
                                    {
                                      "name": "msg_sender",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "contract_address",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "function_selector",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::function_selector::FunctionSelector",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "is_static_call",
                                      "type": {
                                        "kind": "boolean"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "args_hash",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "returns_hash",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "start_side_effect_counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "end_side_effect_counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "public_teardown_call_request",
            "type": {
              "kind": "struct",
              "path": "types::abis::public_call_request::PublicCallRequest",
              "fields": [
                {
                  "name": "msg_sender",
                  "type": {
                    "kind": "struct",
                    "path": "types::address::aztec_address::AztecAddress",
                    "fields": [
                      {
                        "name": "inner",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "contract_address",
                  "type": {
                    "kind": "struct",
                    "path": "types::address::aztec_address::AztecAddress",
                    "fields": [
                      {
                        "name": "inner",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "is_static_call",
                  "type": {
                    "kind": "boolean"
                  }
                },
                {
                  "name": "calldata_hash",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "fee_payer",
            "type": {
              "kind": "struct",
              "path": "types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "expiration_timestamp",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 64
            }
          },
          {
            "name": "is_private_only",
            "type": {
              "kind": "boolean"
            }
          },
          {
            "name": "claimed_revertible_counter",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 32
            }
          }
        ]
      },
      "visibility": "public"
    },
    "error_types": {
      "94765493633582853": {
        "error_kind": "string",
        "string": "private_call_requests length out of bounds"
      },
      "117837988875837642": {
        "error_kind": "string",
        "string": "l2_to_l1_msgs length out of bounds"
      },
      "361444214588792908": {
        "error_kind": "string",
        "string": "attempt to multiply with overflow"
      },
      "593440268255346592": {
        "error_kind": "string",
        "string": "key_validation_requests_and_separators length out of bounds"
      },
      "1889185465531656186": {
        "error_kind": "string",
        "string": "Mismatch counter: side effect does not match hint"
      },
      "1998584279744703196": {
        "error_kind": "string",
        "string": "attempt to subtract with overflow"
      },
      "2965999157539980434": {
        "error_kind": "string",
        "string": "contract address does not match origin"
      },
      "4056541661037948263": {
        "error_kind": "string",
        "string": "First call in a tx cannot be static"
      },
      "4177897422276625301": {
        "error_kind": "string",
        "string": "Mismatch global index: value does not match hint"
      },
      "4450719284691415785": {
        "error_kind": "string",
        "string": "incorrect msg_sender for private call request"
      },
      "6051170412616329527": {
        "error_kind": "string",
        "string": "computed contract address does not match protocol contract derived address"
      },
      "6239565706110373920": {
        "error_kind": "string",
        "string": "Mismatch counter: end of call request does not match hint"
      },
      "6317798328792492338": {
        "error_kind": "string",
        "string": "Counter must be greater than previous counter"
      },
      "6403114577918625889": {
        "error_kind": "string",
        "string": "Mismatch global index: end of call request does not match hint"
      },
      "6441705196486064186": {
        "error_kind": "string",
        "string": "Attempt to pop from an empty vector"
      },
      "6501950505635475641": {
        "error_kind": "string",
        "string": "public_call_requests length out of bounds"
      },
      "7036737383132764408": {
        "error_kind": "string",
        "string": "tx_context in private call does not match the value in tx_request"
      },
      "7218841323701226996": {
        "error_kind": "string",
        "string": "Mismatch counter: value does not match hint"
      },
      "8165923537385367162": {
        "error_kind": "string",
        "string": "computed contract class id does not match updated contract class id"
      },
      "8201347468899693567": {
        "error_kind": "string",
        "string": "Mismatch counter: start of call request does not match hint"
      },
      "8247167135718377098": {
        "error_kind": "string",
        "string": "function_selector in call_context does not match the value in tx_request"
      },
      "8320366403474404434": {
        "error_kind": "string",
        "string": "nullifier_read_requests length out of bounds"
      },
      "8334178102729634909": {
        "error_kind": "string",
        "string": "note_hashes length out of bounds"
      },
      "8414973249286697576": {
        "error_kind": "string",
        "string": "note_hash_read_requests length out of bounds"
      },
      "10218075541036113978": {
        "error_kind": "string",
        "string": "Private call has incorrect counter range"
      },
      "10832362746926332672": {
        "error_kind": "string",
        "string": "Attempting to execute a 'derived' protocol contract address. This is not allowed."
      },
      "11023510496214579275": {
        "error_kind": "string",
        "string": "Users cannot set msg_sender in first call"
      },
      "11217216648848338406": {
        "error_kind": "string",
        "string": "The provided public data tree leaf preimage is not the correct leaf for the requested slot"
      },
      "11697200665944159845": {
        "error_kind": "string",
        "string": "args_hash in private call does not match the value in tx_request"
      },
      "12469291177396340830": {
        "error_kind": "string",
        "string": "call to assert_max_bit_size"
      },
      "12913276134398371456": {
        "error_kind": "string",
        "string": "push out of bounds"
      },
      "12953307709153182743": {
        "error_kind": "string",
        "string": "nullifiers length out of bounds"
      },
      "13734038595735573514": {
        "error_kind": "string",
        "string": "delayed_public_mutable must be zeroed when its stored hash is zero"
      },
      "14886123564205298264": {
        "error_kind": "string",
        "string": "private_logs length out of bounds"
      },
      "14990209321349310352": {
        "error_kind": "string",
        "string": "attempt to add with overflow"
      },
      "15006138040785206729": {
        "error_kind": "string",
        "string": "Sorted counter hints must have null trailing values"
      },
      "15098453168151071904": {
        "error_kind": "string",
        "string": "Failed to validate expected revertible side effect counter"
      },
      "15317677453749268000": {
        "error_kind": "string",
        "string": "Mismatch global index: start of call request does not match hint"
      },
      "15711892660910782274": {
        "error_kind": "string",
        "string": "Hint values do not match hash"
      },
      "15801487259733804996": {
        "error_kind": "string",
        "string": "start_side_effect_counter must be greater than 1"
      },
      "15954133960943293689": {
        "error_kind": "string",
        "string": "Failed to validate expected non revertible side effect counter"
      },
      "16216212843441549037": {
        "error_kind": "string",
        "string": "Proving public value inclusion failed"
      },
      "16431471497789672479": {
        "error_kind": "string",
        "string": "Index out of bounds"
      },
      "16438966280147474101": {
        "error_kind": "string",
        "string": "computed contract address does not match expected one"
      },
      "16557807701413196365": {
        "error_kind": "string",
        "string": "tx_request does not indicate the first function is private"
      },
      "16718235391831656706": {
        "error_kind": "string",
        "string": "incorrect msg_sender for public teardown call request"
      },
      "16736033794689240501": {
        "error_kind": "string",
        "string": "contract_class_logs_hashes length out of bounds"
      },
      "17725478081255413659": {
        "error_kind": "string",
        "string": "Mismatch global index: side effect does not match hint"
      },
      "17782979940490805738": {
        "error_kind": "string",
        "string": "incorrect msg_sender for public call request"
      },
      "18220261005428713684": {
        "error_kind": "string",
        "string": "Counter must be less than the end counter of the call"
      },
      "18348998335150574775": {
        "error_kind": "string",
        "string": "protocol_nullifier in private call does not match the tx request"
      }
    }
  },
  "bytecode": "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IzuLo8LxplPYMb4K2+EqbBGpsM2VVbgm2Vz9MZPpTwBkKXP1DwRs7CrMJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGxisonJJiabmGximtLEXBj9d59i/gbS+R52G4ALzBZGYkZI/XefAn40h/e7T068Yc+LNUXMe/sGLos3cM47kdUs+spfjuq43Nurkn3ApyiVEVZwpf/FKjm6ly5kx9WZy1KruNoPWM3qQ8hjNSG/0FVdZAx8v9BVg44L/L9QHb74Yy6E2fEXvxO++G2ixR+wCm3O4o+5Bo8JG7bMP2wZ+96+gSvjDax5J7KGRW9Y/NdzTESNX2GrI6yBQJUNXwOpQCZaVpF47Lg6v3ZTkGQpwBo/YA27CEIe6xJi8WrY5eW3eF3Q8Tz/r+KFW7zYHji2xSsLt3gOkcUr44aG4dFAGdcpSvR+VqSHlOkhFa/IRI4CSakrkBSuQCKRAklcBQp5SPY/JLoPXbbTuOGHHLbTxOmzb9pnYt3IMSMmTthon5G146dMru85ccJSRrySzPxDlmMwWRivl+93SKUiAf4PcecxI8eN6HP4cs87BD7UEGuvHEBiB21QgpVtclwVuKjn8HHjlqBrZ6+iSQ2QuTAh5PxCkFwh+LQ6F2Gh8Oaxt0+uMkuGylUslivzUHmoXKX05ConkavsCoEnVzGzFoysxBgCJrAWuTSsRYz5jKeighB/PuX055NvyD3SKLIovHUhxdCEHMcx5yJEwbEhC4pADNhzdX7p9OS467/stTNJZpLMJJlJMpNkJslMkpkkM0lmkswkmUkyk2QmyUySmSQzSWaSzCSZSTKTZCbJTJKZJDNJZpLMJJlJMpNkJslMkpkkM0lmkswkmUkyk2QmyUySmSQzSWaSzCSZSTKTZCbJTJKZJDNJZpLMJJlJMpNkJslMkpkkM0lmkswkmUkyk2QmyUySmSQzSWaS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",
  "debug_symbols": "",
  "file_map": {},
  "aztec_version": "6.0.0-rc.3"
}
;
